/**
 * Food databases → `foods` rows. Pure mappers, no I/O; the import scripts
 * and the barcode lookup call these.
 *
 * - USDA FoodData Central (Foundation Foods + SR Legacy JSON): nutrients by
 *   nutrient id; energy is 1008, or the Atwater ids (2048, 2047) that
 *   Foundation Foods use instead.
 * - INDB (Indian Nutrient Databank, recipes from ICMR-NIN IFCT 2017): one
 *   row per recipe, per 100 g, plus a per-serving block that gives the
 *   serving weight.
 * - Open Food Facts: product JSON, nutriments per 100 g (or 100 ml).
 */
import type { FoodInsert } from "@/lib/db/schema";
import { atwaterGap, searchText } from "@/domain/nutrition";

export interface MappedFood {
  food: Omit<FoodInsert, "id" | "createdAt" | "updatedAt">;
  portions: Array<{ label: string; grams: number }>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};
const round = (n: number | undefined, dp = 2) => (n === undefined ? undefined : Math.round(n * 10 ** dp) / 10 ** dp);
/** A per-100 g macro in 0–100 g, else null. */
const macro = (v: number | undefined) => (v === undefined || v < 0 || v > 100 ? null : round(v)!);

/** Tags the timing rules engine (Phase 2b) matches on. */
export function tagsFor(name: string, p: { fibre?: number | null }, micros: Record<string, number>): string[] {
  const n = name.toLowerCase();
  const tags = new Set<string>();
  if (/\b(coffee|espresso|cappuccino|latte|americano)\b/.test(n)) tags.add("coffee");
  if (/\b(tea|chai)\b/.test(n) && !/\bsteak\b/.test(n)) tags.add("tea");
  if (/\b(soy|soya|tofu|edamame|tempeh|miso)\b/.test(n)) tags.add("soy");
  if ((micros.calcium_mg ?? 0) >= 120 || /\b(milk|paneer|curd|yogurt|yoghurt|cheese|dahi)\b/.test(n)) tags.add("calcium_rich");
  if ((micros.iron_mg ?? 0) >= 3) tags.add("iron_rich");
  if ((p.fibre ?? 0) >= 6) tags.add("high_fibre");
  return [...tags].sort();
}

function finish(
  base: Omit<MappedFood["food"], "searchText" | "tags"> & { tags?: string[] },
  portions: MappedFood["portions"]
): MappedFood | null {
  const kcal = num(base.kcal100g);
  if (kcal === undefined || kcal < 0 || kcal > 950) return null;
  const tags = base.tags ?? tagsFor(base.name, { fibre: base.fibre100g }, base.micros ?? {});
  return {
    food: { ...base, tags, searchText: searchText(base.name, base.brand, base.aliases ?? []) },
    portions: portions.filter((p) => p.grams > 0 && p.grams < 5000 && p.label.length <= 80),
  };
}

// --- USDA ------------------------------------------------------------------------

/** USDA nutrient id → our micros key (per 100 g, in the unit named). */
const USDA_MICROS: Record<number, string> = {
  1087: "calcium_mg",
  1089: "iron_mg",
  1090: "magnesium_mg",
  1092: "potassium_mg",
  1095: "zinc_mg",
  1103: "selenium_ug",
  1114: "vitd_ug",
  1162: "vitc_mg",
  1177: "folate_ug",
  1178: "b12_ug",
  1253: "cholesterol_mg",
  1258: "satfat_g",
  1213: "leucine_g",
};

export function usdaFood(item: Obj, dataset: "usda_foundation" | "usda_sr" | "usda_fndds"): MappedFood | null {
  const fdcId = num(item.fdcId);
  const name = typeof item.description === "string" ? item.description.trim() : "";
  if (fdcId === undefined || !name) return null;
  const byId = new Map<number, number>();
  for (const fn of Array.isArray(item.foodNutrients) ? item.foodNutrients : []) {
    if (!isObj(fn) || !isObj(fn.nutrient)) continue;
    const id = num(fn.nutrient.id);
    const amount = num(fn.amount);
    if (id !== undefined && amount !== undefined && !byId.has(id)) byId.set(id, amount);
  }
  const pick = (...ids: number[]) => ids.map((i) => byId.get(i)).find((v) => v !== undefined);
  const micros: Record<string, number> = {};
  for (const [id, key] of Object.entries(USDA_MICROS)) {
    const v = byId.get(Number(id));
    if (v !== undefined && v >= 0) micros[key] = round(v, 3)!;
  }
  const portions: MappedFood["portions"] = [];
  // FNDDS: "Quantity not specified" is what a person typically eats; it's the default serving, not a choice.
  let unspecifiedG: number | undefined;
  for (const p of Array.isArray(item.foodPortions) ? item.foodPortions : []) {
    if (!isObj(p)) continue;
    const grams = num(p.gramWeight);
    if (!grams) continue;
    if (dataset === "usda_fndds") {
      const desc = typeof p.portionDescription === "string" ? p.portionDescription.trim() : "";
      if (/^quantity not specified$/i.test(desc)) {
        unspecifiedG = round(grams, 1);
        continue;
      }
      // FNDDS modifiers are numeric codes ("21000"); the description is the label.
      if (desc && !portions.some((x) => x.label === desc)) portions.push({ label: desc, grams: round(grams, 1)! });
      continue;
    }
    const unit = isObj(p.measureUnit) && p.measureUnit.name !== "undetermined" ? String(p.measureUnit.name) : "";
    const label = [num(p.amount) ?? num(p.value) ?? "", unit, typeof p.modifier === "string" ? p.modifier : "", typeof p.portionDescription === "string" ? p.portionDescription : ""]
      .map(String)
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (label && !portions.some((x) => x.label === label)) portions.push({ label, grams: round(grams, 1)! });
  }
  const category =
    isObj(item.foodCategory) && typeof item.foodCategory.description === "string"
      ? item.foodCategory.description
      : isObj(item.wweiaFoodCategory) && typeof item.wweiaFoodCategory.wweiaFoodCategoryDescription === "string"
        ? item.wweiaFoodCategory.wweiaFoodCategoryDescription
        : null;
  // "Guacamole, NFS" (not further specified) is the plain one: it answers to "guacamole".
  const nfs = name.match(/^(.+?), NFS$/);
  const aliases = nfs ? [nfs[1].toLowerCase()] : [];
  return finish(
    {
      userId: null,
      source: dataset,
      sourceId: String(fdcId),
      name,
      brand: null,
      barcode: null,
      category,
      aliases,
      kcal100g: round(pick(1008, 2048, 2047))!,
      protein100g: macro(pick(1003)),
      carbs100g: macro(pick(1005, 1050)),
      fat100g: macro(pick(1004, 1085)),
      fibre100g: macro(pick(1079)),
      sugar100g: macro(pick(2000, 1063)),
      sodiumMg100g: round(pick(1093)) ?? null,
      micros,
      servingG: unspecifiedG ?? portions[0]?.grams ?? null,
      servingLabel: unspecifiedG ? "1 serving" : (portions[0]?.label ?? null),
      verified: true,
    },
    portions
  );
}

// --- INDB ------------------------------------------------------------------------

const INDB_MICROS: Record<string, string> = {
  calcium_mg: "calcium_mg",
  iron_mg: "iron_mg",
  magnesium_mg: "magnesium_mg",
  potassium_mg: "potassium_mg",
  zinc_mg: "zinc_mg",
  selenium_ug: "selenium_ug",
  vitc_mg: "vitc_mg",
  folate_ug: "folate_ug",
  cholesterol_mg: "cholesterol_mg",
};

/** "Hot tea (Garam Chai)" → name + alias "garam chai". */
function splitAlias(raw: string): { name: string; aliases: string[] } {
  const name = raw.replace(/\s+/g, " ").trim();
  const aliases = [...name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim().toLowerCase()).filter(Boolean);
  return { name, aliases };
}

/**
 * INDB's deep-fried recipes (poori, pakora, bhatura, vada, cutlet...) count
 * the whole pan of frying oil, not what the food absorbs: 60-90 g fat per
 * 100 g, about double the real calories. Over 35 g fat per 100 g is only
 * believable for fats themselves.
 */
const TRULY_FATTY = /mayonnaise|dressing|baghar|tadka|ghee|butter|\boil\b/i;
export function indbPlausible(name: string, fatPer100g: number | undefined): boolean {
  return (fatPer100g ?? 0) <= 35 || TRULY_FATTY.test(name);
}

/** One INDB "Nutrient Data" row keyed by header. Values per 100 g. */
export function indbFood(row: Record<string, unknown>): MappedFood | null {
  const code = typeof row.food_code === "string" ? row.food_code.trim() : "";
  const rawName = typeof row.food_name === "string" ? row.food_name : "";
  if (!code || !rawName.trim()) return null;
  const kcal = num(row.energy_kcal);
  const { name, aliases } = splitAlias(rawName);
  const micros: Record<string, number> = {};
  for (const [col, key] of Object.entries(INDB_MICROS)) {
    const v = num(row[col]);
    if (v !== undefined && v >= 0) micros[key] = round(v, 3)!;
  }
  const sfa = num(row.sfa_mg);
  if (sfa !== undefined) micros.satfat_g = round(sfa / 1000, 3)!;
  // Serving weight: per-serving energy ÷ per-100 g energy.
  const servingKcal = num(row.unit_serving_energy_kcal);
  const servingG = kcal && servingKcal ? round((servingKcal / kcal) * 100, 1)! : undefined;
  const unit = typeof row.servings_unit === "string" ? row.servings_unit.trim() : "";
  const portions = servingG && unit ? [{ label: `1 ${unit}`, grams: servingG }] : [];
  return finish(
    {
      userId: null,
      source: "indb",
      sourceId: code,
      name,
      brand: null,
      barcode: null,
      category: "Indian recipe",
      aliases,
      kcal100g: round(kcal)!,
      protein100g: macro(num(row.protein_g)),
      carbs100g: macro(num(row.carb_g)),
      fat100g: macro(num(row.fat_g)),
      fibre100g: macro(num(row.fibre_g)),
      sugar100g: macro(num(row.freesugar_g)),
      sodiumMg100g: round(num(row.sodium_mg)) ?? null,
      micros,
      servingG: servingG ?? null,
      servingLabel: portions[0]?.label ?? null,
      verified: indbPlausible(rawName, num(row.fat_g)),
    },
    portions
  );
}

// --- Open Food Facts -------------------------------------------------------------

export function offFood(product: Obj): MappedFood | null {
  const code = typeof product.code === "string" ? product.code : typeof product._id === "string" ? product._id : "";
  const n = isObj(product.nutriments) ? product.nutriments : {};
  const name = [product.product_name_en, product.product_name, product.generic_name]
    .find((v) => typeof v === "string" && v.trim()) as string | undefined;
  if (!code || !name) return null;
  let kcal = num(n["energy-kcal_100g"]);
  const kj = num(n["energy-kj_100g"]) ?? num(n.energy_100g);
  if (kcal === undefined && kj !== undefined) kcal = kj / 4.184;
  if (kcal === undefined) return null;
  const sodiumG = num(n.sodium_100g) ?? (num(n.salt_100g) !== undefined ? num(n.salt_100g)! / 2.5 : undefined);
  const servingG = num(product.serving_quantity);
  const brand = typeof product.brands === "string" ? product.brands.split(",")[0].trim() || null : null;
  const per100 = {
    kcal: round(kcal)!,
    protein: macro(num(n.proteins_100g)),
    carbs: macro(num(n.carbohydrates_100g)),
    fat: macro(num(n.fat_100g)),
    fibre: macro(num(n.fiber_100g)),
  };
  const micros: Record<string, number> = {};
  const ca = num(n.calcium_100g);
  if (ca !== undefined) micros.calcium_mg = round(ca * 1000, 1)!;
  const fe = num(n.iron_100g);
  if (fe !== undefined) micros.iron_mg = round(fe * 1000, 2)!;
  const label = typeof product.serving_size === "string" && product.serving_size.trim() ? product.serving_size.trim().slice(0, 80) : null;
  // Crowd-sourced: only call it verified when kcal agree with the macros.
  const gap = atwaterGap(per100);
  return finish(
    {
      userId: null,
      source: "off",
      sourceId: code,
      name: name.trim().slice(0, 200),
      brand,
      barcode: code,
      category: null,
      aliases: [],
      kcal100g: per100.kcal,
      protein100g: per100.protein,
      carbs100g: per100.carbs,
      fat100g: per100.fat,
      fibre100g: per100.fibre,
      sugar100g: macro(num(n.sugars_100g)),
      sodiumMg100g: sodiumG !== undefined ? round(sodiumG * 1000) ?? null : null,
      micros,
      servingG: servingG && servingG > 0 ? round(servingG, 1)! : null,
      servingLabel: label,
      verified: gap !== null && gap < 0.15,
    },
    servingG && servingG > 0 ? [{ label: label ?? "1 serving", grams: round(servingG, 1)! }] : []
  );
}
