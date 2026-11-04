import "server-only";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { foodFavourites, foodPortions, foods, recipeIngredients, savedMealItems, savedMeals, type FoodRow } from "@/lib/db/schema";
import { isStrongMatch, rankCandidates, recipePer100, searchText, type FoodSource, type Per100 } from "@/domain/nutrition";
import { DomainError } from "../errors";
import { offFood, tagsFor, type MappedFood } from "./sources";

export interface FoodSummary {
  id: string;
  name: string;
  brand: string | null;
  source: FoodSource;
  kcal100g: number;
  protein100g: number | null;
  carbs100g: number | null;
  fat100g: number | null;
  fibre100g: number | null;
  servingG: number | null;
  servingLabel: string | null;
  verified: boolean;
  /** Where a web-sourced food's numbers came from. */
  sourceUrl?: string | null;
  favourite: boolean;
  timesLogged: number;
  /** Contains the food word of the query (see isStrongMatch). Weak ones are offered, never auto-picked. */
  strong?: boolean;
}

export function per100(f: Pick<FoodRow, "kcal100g" | "protein100g" | "carbs100g" | "fat100g" | "fibre100g">): Per100 {
  return { kcal: f.kcal100g, protein: f.protein100g, carbs: f.carbs100g, fat: f.fat100g, fibre: f.fibre100g };
}

type Row = Record<string, unknown>;
const toSummary = (r: Row): FoodSummary => ({
  id: String(r.id),
  name: String(r.name),
  brand: (r.brand as string | null) ?? null,
  source: r.source as FoodSource,
  kcal100g: Number(r.kcal_100g),
  protein100g: r.protein_100g == null ? null : Number(r.protein_100g),
  carbs100g: r.carbs_100g == null ? null : Number(r.carbs_100g),
  fat100g: r.fat_100g == null ? null : Number(r.fat_100g),
  fibre100g: r.fibre_100g == null ? null : Number(r.fibre_100g),
  servingG: r.serving_g == null ? null : Number(r.serving_g),
  servingLabel: (r.serving_label as string | null) ?? null,
  verified: Boolean(r.verified),
  sourceUrl: (r.source_url as string | null) ?? null,
  favourite: Boolean(r.favourite),
  timesLogged: Number(r.times ?? 0),
});

const SUMMARY_COLS = sql.raw(
  `f.id, f.name, f.brand, f.source, f.kcal_100g, f.protein_100g, f.carbs_100g, f.fat_100g, f.fibre_100g, f.serving_g, f.serving_label, f.verified, f.source_url`
);

function rowsOf(res: unknown): Row[] {
  return ((res as { rows?: Row[] }).rows ?? (res as Row[])) as Row[];
}

/**
 * Candidates by word similarity (pg_trgm) or full-text, then ranked in
 * TypeScript (rankCandidates): relevance first, then your own foods,
 * Indian data, USDA, Open Food Facts, habit and favourites.
 */
export async function searchFoods(
  userId: string,
  query: string,
  limit = 25,
  opts: { preferCooked?: boolean } = {}
): Promise<FoodSummary[]> {
  const q = searchText(query);
  if (q.length < 2) return [];
  // Any word, too: "masala chai" must reach "Garam Chai" even when trigram similarity favours "masala".
  const anyWord = q.split(" ").filter((w) => w.length > 2).join(" or ");
  const res = await db.execute(sql`
    SELECT ${SUMMARY_COLS},
      word_similarity(${q}, f.search_text) AS sim,
      f.search_tsv @@ plainto_tsquery('simple', ${q}) AS all_words,
      ${q} = ANY (f.aliases) AS alias_exact,
      f.category,
      f.search_text,
      EXISTS (SELECT 1 FROM food_favourites v WHERE v.user_id = ${userId} AND v.food_id = f.id) AS favourite,
      (SELECT count(*) FROM food_log_items i JOIN food_logs l ON l.id = i.log_id
        WHERE l.user_id = ${userId} AND i.food_id = f.id AND l.local_date > current_date - 90)::int AS times
    FROM foods f
    WHERE (f.user_id IS NULL OR f.user_id = ${userId}) AND f.archived_at IS NULL
      AND (${q} <% f.search_text OR f.search_tsv @@ plainto_tsquery('simple', ${q})
        OR (${anyWord} <> '' AND f.search_tsv @@ websearch_to_tsquery('simple', ${anyWord})))
    -- Exact aliases and short names first: a one-word query ties hundreds of rows on similarity,
    -- and the plain food ("egg", "rice") must survive the cut.
    ORDER BY (${q} = ANY (f.aliases)) DESC, sim DESC, length(f.name) ASC
    LIMIT 150`);
  const rows = rowsOf(res).map((r) => ({
    ...toSummary(r),
    similarity: Number(r.sim),
    allWords: Boolean(r.all_words),
    aliasExact: Boolean(r.alias_exact),
    category: (r.category as string | null) ?? null,
    text: String(r.search_text ?? ""),
  }));
  return rankCandidates(rows, q, limit, opts).map((r): FoodSummary => {
    const { similarity, allWords, aliasExact, category, text, ...f } = r;
    void similarity;
    void allWords;
    void category;
    return { ...f, strong: isStrongMatch({ text, aliasExact }, q) };
  });
}

/** Recently logged foods, most recent first, without repeats. */
export async function recentFoods(userId: string, limit = 20): Promise<FoodSummary[]> {
  const res = await db.execute(sql`
    SELECT ${SUMMARY_COLS}, r.last_at,
      EXISTS (SELECT 1 FROM food_favourites v WHERE v.user_id = ${userId} AND v.food_id = f.id) AS favourite,
      r.times
    FROM (
      SELECT i.food_id, max(l.eaten_at) AS last_at, count(*)::int AS times
      FROM food_log_items i JOIN food_logs l ON l.id = i.log_id
      WHERE l.user_id = ${userId} AND i.food_id IS NOT NULL AND l.local_date > current_date - 90
      GROUP BY i.food_id
    ) r JOIN foods f ON f.id = r.food_id
    WHERE (f.user_id IS NULL OR f.user_id = ${userId})
    ORDER BY r.last_at DESC
    LIMIT ${limit}`);
  return rowsOf(res).map(toSummary);
}

/** What you log most (last 90 days, at least twice), most often first. */
export async function frequentFoods(userId: string, limit = 15): Promise<FoodSummary[]> {
  const res = await db.execute(sql`
    SELECT ${SUMMARY_COLS}, r.last_at,
      EXISTS (SELECT 1 FROM food_favourites v WHERE v.user_id = ${userId} AND v.food_id = f.id) AS favourite,
      r.times
    FROM (
      SELECT i.food_id, max(l.eaten_at) AS last_at, count(*)::int AS times
      FROM food_log_items i JOIN food_logs l ON l.id = i.log_id
      WHERE l.user_id = ${userId} AND i.food_id IS NOT NULL AND l.local_date > current_date - 90
      GROUP BY i.food_id
      HAVING count(*) >= 2
    ) r JOIN foods f ON f.id = r.food_id
    WHERE (f.user_id IS NULL OR f.user_id = ${userId}) AND f.archived_at IS NULL
    ORDER BY r.times DESC, r.last_at DESC
    LIMIT ${limit}`);
  return rowsOf(res).map(toSummary);
}

export async function favouriteFoods(userId: string): Promise<FoodSummary[]> {
  const res = await db.execute(sql`
    SELECT ${SUMMARY_COLS}, true AS favourite, 0 AS times
    FROM food_favourites v JOIN foods f ON f.id = v.food_id
    WHERE v.user_id = ${userId} AND (f.user_id IS NULL OR f.user_id = ${userId})
    ORDER BY v.created_at DESC`);
  return rowsOf(res).map(toSummary);
}

/** Your own foods and recipes. */
export async function myFoods(userId: string): Promise<FoodSummary[]> {
  const res = await db.execute(sql`
    SELECT ${SUMMARY_COLS},
      EXISTS (SELECT 1 FROM food_favourites v WHERE v.user_id = ${userId} AND v.food_id = f.id) AS favourite, 0 AS times
    FROM foods f WHERE f.user_id = ${userId} AND f.archived_at IS NULL
    ORDER BY f.source DESC, f.name`);
  return rowsOf(res).map(toSummary);
}

export async function setFavourite(userId: string, foodId: string, on: boolean): Promise<void> {
  if (on) {
    await getFood(userId, foodId); // throws unless the food is shared or the user's own
    await db.insert(foodFavourites).values({ userId, foodId }).onConflictDoNothing();
  }
  else await db.delete(foodFavourites).where(and(eq(foodFavourites.userId, userId), eq(foodFavourites.foodId, foodId)));
}

/** A food the athlete may use: shared, or their own. Throws otherwise. */
export async function getFood(userId: string, id: string) {
  const [food] = await db
    .select()
    .from(foods)
    .where(and(eq(foods.id, id), or(isNull(foods.userId), eq(foods.userId, userId))));
  if (!food) throw new DomainError("That food doesn't exist.");
  const portions = await db
    .select({ label: foodPortions.label, grams: foodPortions.grams })
    .from(foodPortions)
    .where(eq(foodPortions.foodId, id))
    .orderBy(asc(foodPortions.position));
  const ingredients =
    food.source === "recipe"
      ? await db
          .select({ position: recipeIngredients.position, grams: recipeIngredients.grams, id: foods.id, name: foods.name })
          .from(recipeIngredients)
          .innerJoin(foods, eq(foods.id, recipeIngredients.ingredientId))
          .where(eq(recipeIngredients.recipeId, id))
          .orderBy(asc(recipeIngredients.position))
      : [];
  return { food, portions, ingredients };
}

export async function getFoodsByIds(userId: string, ids: string[]): Promise<Map<string, FoodRow>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select()
    .from(foods)
    .where(and(inArray(foods.id, ids), or(isNull(foods.userId), eq(foods.userId, userId))));
  return new Map(rows.map((r) => [r.id, r]));
}

// --- Barcodes (Open Food Facts) ---------------------------------------------------

const OFF_FIELDS =
  "code,product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,nutriments,countries_tags";

/**
 * A barcode from the database, or fetched from Open Food Facts (which covers
 * Indian and UAE packaged products) and cached as a shared food.
 */
export async function foodByBarcode(barcode: string, fetchImpl: typeof fetch = fetch): Promise<FoodRow | null> {
  const code = barcode.replace(/\D/g, "");
  if (code.length < 8 || code.length > 14) throw new DomainError("That doesn't look like a barcode.");
  const [cached] = await db.select().from(foods).where(and(eq(foods.barcode, code), isNull(foods.archivedAt))).limit(1);
  if (cached) return cached;
  const res = await fetchImpl(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`, {
    headers: { "User-Agent": "Olympus/1.0 (personal nutrition log; contact via github.com/AdithyaBhat17/olympus)" },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
  const body = (await res.json()) as { status?: number; product?: Record<string, unknown> };
  if (body.status !== 1 || !body.product) return null;
  const mapped = offFood({ code, ...body.product });
  if (!mapped) return null;
  return saveSharedFood(mapped);
}

/** A mapped database food (Open Food Facts) saved once for everyone, with its portions. */
export async function saveSharedFood(mapped: MappedFood): Promise<FoodRow> {
  const [saved] = await db
    .insert(foods)
    .values(mapped.food)
    .onConflictDoUpdate({
      target: [foods.source, foods.sourceId],
      targetWhere: sql`source_id IS NOT NULL AND user_id IS NULL`,
      set: { updatedAt: sql`now()` },
    })
    .returning();
  if (mapped.portions.length) {
    await db
      .insert(foodPortions)
      .values(mapped.portions.map((p, position) => ({ foodId: saved.id, label: p.label, grams: p.grams, position })))
      .onConflictDoNothing();
  }
  return saved;
}

// --- Your own foods and recipes --------------------------------------------------

export interface UserFoodInput {
  name: string;
  brand?: string | null;
  /** Per 100 g, or per serving when servingG is given and perServing is true. */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre?: number;
  perServing?: boolean;
  servingG?: number | null;
  servingLabel?: string | null;
  aliases?: string[];
}

function checkMacros(v: number, what: string, max: number) {
  if (!Number.isFinite(v) || v < 0 || v > max) throw new DomainError(`${what} must be between 0 and ${max}.`);
}

/** A food from a label or a known value. Values are stored per 100 g. */
export async function createUserFood(userId: string, input: UserFoodInput): Promise<string> {
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new DomainError("Give the food a name.");
  const servingG = input.servingG ?? null;
  if (input.perServing && !(servingG && servingG > 0)) throw new DomainError("Per-serving values need the serving weight in grams.");
  const k = input.perServing ? 100 / servingG! : 1;
  const v = {
    kcal: input.kcal * k,
    protein: input.protein * k,
    carbs: input.carbs * k,
    fat: input.fat * k,
    fibre: (input.fibre ?? 0) * k,
  };
  checkMacros(v.kcal, "Calories per 100 g", 950);
  for (const [n, x] of [["Protein", v.protein], ["Carbs", v.carbs], ["Fat", v.fat], ["Fibre", v.fibre]] as const) checkMacros(x, `${n} per 100 g`, 100);
  const aliases = (input.aliases ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean).slice(0, 10);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const [row] = await db
    .insert(foods)
    .values({
      userId,
      source: "user",
      name,
      brand: input.brand?.trim() || null,
      aliases,
      searchText: searchText(name, input.brand, aliases),
      kcal100g: r2(v.kcal),
      protein100g: r2(v.protein),
      carbs100g: r2(v.carbs),
      fat100g: r2(v.fat),
      fibre100g: r2(v.fibre),
      tags: tagsFor(name, { fibre: v.fibre }, {}),
      servingG,
      servingLabel: input.servingLabel?.trim() || (servingG ? "1 serving" : null),
      verified: true,
    })
    .returning({ id: foods.id });
  if (servingG) {
    await db.insert(foodPortions).values({ foodId: row.id, label: input.servingLabel?.trim() || "1 serving", grams: servingG });
  }
  return row.id;
}

export interface RecipeInput {
  id?: string;
  name: string;
  ingredients: Array<{ foodId: string; grams: number }>;
  /** Cooked weight of the whole pot, grams. Defaults to the raw total. */
  yieldG?: number | null;
  /** A usual portion, e.g. "1 katori" = 150 g. */
  servingLabel?: string | null;
  servingG?: number | null;
  aliases?: string[];
}

/**
 * Save a recipe from weighed ingredients. Its per-100 g values are computed
 * from the ingredients now and stored, so it searches and logs like any food.
 * Editing a recipe doesn't change what was already logged.
 */
export async function saveRecipe(userId: string, input: RecipeInput): Promise<string> {
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new DomainError("Give the recipe a name.");
  const ingredients = input.ingredients.filter((i) => i.grams > 0);
  if (!ingredients.length) throw new DomainError("Add at least one ingredient with its weight.");
  if (ingredients.length > 60) throw new DomainError("That's a lot of ingredients. Keep it under 60.");
  const byId = await getFoodsByIds(userId, [...new Set(ingredients.map((i) => i.foodId))]);
  for (const i of ingredients) if (!byId.has(i.foodId)) throw new DomainError("One of the ingredients doesn't exist.");
  if (input.id && ingredients.some((i) => i.foodId === input.id)) throw new DomainError("A recipe can't contain itself.");
  const r = recipePer100(
    ingredients.map((i) => ({ food: per100(byId.get(i.foodId)!), grams: i.grams })),
    input.yieldG
  );
  const aliases = (input.aliases ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean).slice(0, 10);
  const tags = [...new Set(ingredients.flatMap((i) => byId.get(i.foodId)!.tags))].sort();
  const values = {
    userId,
    source: "recipe" as const,
    name,
    aliases,
    searchText: searchText(name, null, aliases),
    kcal100g: r.kcal,
    protein100g: r.protein,
    carbs100g: r.carbs,
    fat100g: r.fat,
    fibre100g: r.fibre,
    tags,
    recipeYieldG: r.yieldG,
    servingG: input.servingG ?? null,
    servingLabel: input.servingLabel?.trim() || null,
    verified: true,
    updatedAt: new Date(),
  };
  let id = input.id;
  if (id) {
    const updated = await db
      .update(foods)
      .set(values)
      .where(and(eq(foods.id, id), eq(foods.userId, userId), eq(foods.source, "recipe")))
      .returning({ id: foods.id });
    if (!updated.length) throw new DomainError("That recipe doesn't exist.");
    await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
    await db.delete(foodPortions).where(eq(foodPortions.foodId, id));
  } else {
    [{ id }] = await db.insert(foods).values(values).returning({ id: foods.id });
  }
  await db
    .insert(recipeIngredients)
    .values(ingredients.map((i, position) => ({ recipeId: id!, position, ingredientId: i.foodId, grams: i.grams })));
  const portions = [
    ...(input.servingG && input.servingLabel?.trim() ? [{ label: input.servingLabel.trim(), grams: input.servingG }] : []),
    { label: "whole recipe", grams: r.yieldG },
  ];
  await db
    .insert(foodPortions)
    .values(portions.map((p, position) => ({ foodId: id!, label: p.label, grams: p.grams, position })))
    .onConflictDoNothing();
  return id!;
}

/** Hide one of your foods or recipes. Past logs keep their snapshot. */
export async function archiveFood(userId: string, id: string): Promise<void> {
  await db
    .update(foods)
    .set({ archivedAt: new Date() })
    .where(and(eq(foods.id, id), eq(foods.userId, userId)));
}

/** How often and how much of each food the athlete eats: "usual portions" for the parser. */
export async function usualPortions(userId: string, limit = 30): Promise<Array<{ foodId: string; name: string; grams: number; times: number }>> {
  const res = await db.execute(sql`
    SELECT i.food_id, f.name, percentile_cont(0.5) WITHIN GROUP (ORDER BY i.grams) AS grams, count(*)::int AS times
    FROM food_log_items i JOIN food_logs l ON l.id = i.log_id JOIN foods f ON f.id = i.food_id
    WHERE l.user_id = ${userId} AND (f.user_id IS NULL OR f.user_id = ${userId}) AND i.grams IS NOT NULL AND l.local_date > current_date - 120
    GROUP BY i.food_id, f.name
    HAVING count(*) >= 2
    ORDER BY count(*) DESC
    LIMIT ${limit}`);
  return rowsOf(res).map((r) => ({ foodId: String(r.food_id), name: String(r.name), grams: Number(r.grams), times: Number(r.times) }));
}

// --- Saved meals ------------------------------------------------------------------

export interface SavedMeal {
  id: string;
  name: string;
  items: Array<{ food: FoodSummary; grams: number }>;
  kcal: number;
  protein: number;
}

/** Save a set of foods + grams under a name ("Usual breakfast"). Same name replaces. */
export async function saveMeal(userId: string, name: string, items: Array<{ foodId: string; grams: number }>): Promise<string> {
  const n = name.trim().slice(0, 80);
  if (!n) throw new DomainError("Give the meal a name.");
  const valid = items.filter((i) => i.grams > 0).slice(0, 30);
  if (!valid.length) throw new DomainError("A saved meal needs at least one food.");
  const byId = await getFoodsByIds(userId, [...new Set(valid.map((i) => i.foodId))]);
  if (valid.some((i) => !byId.has(i.foodId))) throw new DomainError("One of those foods doesn't exist.");
  const [meal] = await db
    .insert(savedMeals)
    .values({ userId, name: n })
    .onConflictDoUpdate({ target: [savedMeals.userId, savedMeals.name], set: { name: n } })
    .returning({ id: savedMeals.id });
  await db.delete(savedMealItems).where(eq(savedMealItems.mealId, meal.id));
  await db.insert(savedMealItems).values(valid.map((i, position) => ({ mealId: meal.id, position, foodId: i.foodId, grams: i.grams })));
  return meal.id;
}

export async function listSavedMeals(userId: string): Promise<SavedMeal[]> {
  const res = await db.execute(sql`
    SELECT m.id AS meal_id, m.name AS meal_name, i.grams AS item_grams, ${SUMMARY_COLS}, false AS favourite, 0 AS times
    FROM saved_meals m JOIN saved_meal_items i ON i.meal_id = m.id JOIN foods f ON f.id = i.food_id
    WHERE m.user_id = ${userId} AND (f.user_id IS NULL OR f.user_id = ${userId})
    ORDER BY m.name, i.position`);
  const meals = new Map<string, SavedMeal>();
  for (const r of rowsOf(res)) {
    const id = String(r.meal_id);
    if (!meals.has(id)) meals.set(id, { id, name: String(r.meal_name), items: [], kcal: 0, protein: 0 });
    const food = toSummary(r);
    const grams = Number(r.item_grams);
    const m = meals.get(id)!;
    m.items.push({ food, grams });
    m.kcal = Math.round(m.kcal + (food.kcal100g * grams) / 100);
    m.protein = Math.round((m.protein + ((food.protein100g ?? 0) * grams) / 100) * 10) / 10;
  }
  return [...meals.values()];
}

export async function deleteSavedMeal(userId: string, id: string): Promise<void> {
  await db.delete(savedMeals).where(and(eq(savedMeals.id, id), eq(savedMeals.userId, userId)));
}
