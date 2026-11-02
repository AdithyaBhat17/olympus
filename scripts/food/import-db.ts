/**
 * Import the shared food databases into `foods` / `food_portions`.
 *
 *   pnpm food:import [--only usda_sr,usda_foundation,indb] [--dry-run]
 *
 * Sources (downloaded once into .food-data/, gitignored):
 * - USDA FoodData Central SR Legacy (2018-04) and Foundation Foods
 *   (2026-10-29), JSON. Public domain (CC0).
 * - INDB, the Indian Nutrient Databank (Vijayakumar et al. 2024, Current
 *   Developments in Nutrition), INDB.xlsx from the authors' repository
 *   lindsayjaacks/Indian-Nutrient-Databank-INDB-. 1,014 Indian recipes,
 *   per 100 g, computed from ICMR-NIN IFCT 2017.
 *
 * Idempotent: rows are upserted on (source, source_id) and their portions
 * replaced, so re-running after a new USDA release just updates.
 */
import { arg, dbHost, flag } from "../lib/env";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";

const CACHE = ".food-data";
const SOURCES = {
  usda_sr: {
    url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip",
    key: "SRLegacyFoods",
  },
  usda_foundation: {
    url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-10-29.zip",
    key: "FoundationFoods",
  },
  indb: {
    url: "https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/INDB.xlsx",
    key: "",
  },
} as const;
type SourceName = keyof typeof SOURCES;

async function download(url: string): Promise<Uint8Array> {
  mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, path.basename(url));
  if (!existsSync(file)) {
    console.error(`Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
  }
  return new Uint8Array(readFileSync(file));
}

async function main() {
  const only = (arg("only")?.split(",") ?? Object.keys(SOURCES)) as SourceName[];
  const dry = flag("dry-run");
  console.error(`DB host: ${dbHost()}${dry ? " (dry run)" : ""}`);

  const { usdaFood, indbFood } = await import("../../src/server/food/sources");
  const { aliasesFor, USDA_ALIASES } = await import("../../src/server/food/aliases");
  const { searchText } = await import("../../src/domain/nutrition");
  type Mapped = NonNullable<ReturnType<typeof usdaFood>>;

  const mapped: Mapped[] = [];
  const usedAliases = new Set<number>();
  for (const name of only) {
    const src = SOURCES[name];
    const bytes = await download(src.url);
    let rows: Mapped[] = [];
    if (name === "indb") {
      const readAll = (await import("read-excel-file/node")).default;
      const [{ data }] = await readAll(Buffer.from(bytes));
      const [header, ...body] = data as unknown[][];
      rows = body
        .map((r) => indbFood(Object.fromEntries((header as string[]).map((h, i) => [h, r[i]]))))
        .filter((x): x is Mapped => !!x);
    } else {
      const files = unzipSync(bytes);
      const json = JSON.parse(strFromU8(Object.values(files)[0]))[src.key] as Record<string, unknown>[];
      rows = json.map((x) => usdaFood(x, name)).filter((x): x is Mapped => !!x);
      for (const r of rows) {
        const { aliases, matched } = aliasesFor(r.food.name);
        if (!aliases.length) continue;
        matched.forEach((i) => usedAliases.add(i));
        r.food.aliases = aliases;
        r.food.searchText = searchText(r.food.name, r.food.brand, aliases);
      }
    }
    console.error(`${name}: ${rows.length} foods`);
    mapped.push(...rows);
  }
  if (only.some((s) => s.startsWith("usda"))) {
    const unused = USDA_ALIASES.filter((_, i) => !usedAliases.has(i)).map((a) => a.match.source);
    console.error(`Aliases applied: ${usedAliases.size}/${USDA_ALIASES.length}${unused.length ? `; unmatched: ${unused.join(" | ")}` : ""}`);
  }
  if (dry) return;

  const { db } = await import("../../src/lib/db");
  const { foods, foodPortions } = await import("../../src/lib/db/schema");
  const { and, inArray, isNotNull, isNull, sql } = await import("drizzle-orm");

  const BATCH = 400;
  let done = 0;
  for (let i = 0; i < mapped.length; i += BATCH) {
    const batch = mapped.slice(i, i + BATCH);
    const set = Object.fromEntries(
      [
        "name", "category", "aliases", "searchText", "kcal100g", "protein100g", "carbs100g", "fat100g", "fibre100g",
        "sugar100g", "sodiumMg100g", "micros", "tags", "servingG", "servingLabel", "verified",
      ].map((k) => [k, sql.raw(`excluded.${(foods as unknown as Record<string, { name: string }>)[k].name}`)])
    );
    const saved = await db
      .insert(foods)
      .values(batch.map((m) => m.food))
      .onConflictDoUpdate({
        target: [foods.source, foods.sourceId],
        targetWhere: and(isNotNull(foods.sourceId), isNull(foods.userId)),
        set: { ...set, updatedAt: sql`now()` },
      })
      .returning({ id: foods.id, source: foods.source, sourceId: foods.sourceId });
    const idOf = new Map(saved.map((s) => [`${s.source}:${s.sourceId}`, s.id]));
    await db.delete(foodPortions).where(inArray(foodPortions.foodId, saved.map((s) => s.id)));
    const portions = batch.flatMap((m) => {
      const id = idOf.get(`${m.food.source}:${m.food.sourceId}`);
      return id ? m.portions.map((p, position) => ({ foodId: id, label: p.label, grams: p.grams, position })) : [];
    });
    for (let j = 0; j < portions.length; j += 1000) {
      await db.insert(foodPortions).values(portions.slice(j, j + 1000)).onConflictDoNothing();
    }
    done += batch.length;
    process.stderr.write(`\r${done}/${mapped.length}`);
  }
  console.error("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
