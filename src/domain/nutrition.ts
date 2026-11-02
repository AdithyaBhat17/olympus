/**
 * Nutrition maths. Pure: no I/O.
 *
 * - Food values are per 100 g; an item's nutrients are value × grams / 100.
 * - A recipe's per-100 g values are its ingredients' totals ÷ cooked yield.
 * - Exercise calories are never added to the budget: remaining = target − eaten.
 * - Protein toward the floor excludes items marked counts_to_protein = false
 *   (collagen by default: incomplete amino acids, negligible leucine). Their
 *   protein is reported separately.
 */

export interface Per100 {
  kcal: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fibre: number | null;
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Nutrients in `grams` of a food. Unknown nutrients count as 0. */
export function forGrams(food: Per100, grams: number): Macros {
  const f = Math.max(0, grams) / 100;
  return {
    kcal: r1(food.kcal * f),
    protein: r1((food.protein ?? 0) * f),
    carbs: r1((food.carbs ?? 0) * f),
    fat: r1((food.fat ?? 0) * f),
    fibre: r1((food.fibre ?? 0) * f),
  };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: r1(a.kcal + b.kcal),
    protein: r1(a.protein + b.protein),
    carbs: r1(a.carbs + b.carbs),
    fat: r1(a.fat + b.fat),
    fibre: r1(a.fibre + b.fibre),
  };
}

export interface LoggedItem extends Macros {
  countsToProtein: boolean;
}

export interface DayTotals extends Macros {
  /** Protein that counts toward the floor. */
  proteinCounted: number;
  /** Protein from items that don't count (collagen). */
  proteinExcluded: number;
}

export function dayTotals(items: LoggedItem[]): DayTotals {
  let t = ZERO;
  let excluded = 0;
  for (const i of items) {
    t = addMacros(t, i);
    if (!i.countsToProtein) excluded += i.protein;
  }
  excluded = r1(excluded);
  return { ...t, proteinCounted: r1(t.protein - excluded), proteinExcluded: excluded };
}

export interface Budget {
  kcalTarget: number | null;
  proteinTarget: number | null;
}

export interface Remaining {
  /** Negative when over. Null without a target. Exercise never adds to it. */
  kcal: number | null;
  /** Grams still to eat toward the floor; 0 once reached. */
  protein: number | null;
  proteinPct: number | null;
  kcalPct: number | null;
}

export function remaining(t: DayTotals, b: Budget): Remaining {
  return {
    kcal: b.kcalTarget == null ? null : Math.round(b.kcalTarget - t.kcal),
    protein: b.proteinTarget == null ? null : r1(Math.max(0, b.proteinTarget - t.proteinCounted)),
    proteinPct: b.proteinTarget ? Math.round((t.proteinCounted / b.proteinTarget) * 100) : null,
    kcalPct: b.kcalTarget ? Math.round((t.kcal / b.kcalTarget) * 100) : null,
  };
}

export interface Ingredient {
  food: Per100;
  grams: number;
}

/**
 * Per-100 g values of a recipe. `yieldG` is the cooked weight of the whole
 * pot (water boils off, rice absorbs it); defaults to the raw total.
 */
export function recipePer100(ingredients: Ingredient[], yieldG?: number | null): Per100 & { rawG: number; yieldG: number } {
  const rawG = ingredients.reduce((s, i) => s + i.grams, 0);
  const total = ingredients.reduce((s, i) => addMacros(s, forGrams(i.food, i.grams)), ZERO);
  const y = yieldG && yieldG > 0 ? yieldG : rawG;
  if (y <= 0) return { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, rawG, yieldG: 0 };
  const per = (n: number) => Math.round((n / y) * 100 * 100) / 100;
  return {
    kcal: per(total.kcal),
    protein: per(total.protein),
    carbs: per(total.carbs),
    fat: per(total.fat),
    fibre: per(total.fibre),
    rawG: Math.round(rawG * 10) / 10,
    yieldG: y,
  };
}

/** 4/4/9 Atwater check: how far a food's kcal is from its macros, as a share. */
export function atwaterGap(f: Per100): number | null {
  if (f.protein == null || f.carbs == null || f.fat == null || f.kcal <= 0) return null;
  const est = f.protein * 4 + f.carbs * 4 + f.fat * 9;
  return Math.abs(est - f.kcal) / f.kcal;
}

// --- Meals -------------------------------------------------------------------

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";
export const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

/** Default meal for a local time of day ("HH:mm" or minutes after midnight). */
export function mealForTime(localMinutes: number): Meal {
  if (localMinutes >= 4 * 60 && localMinutes < 11 * 60) return "breakfast";
  if (localMinutes >= 11 * 60 + 30 && localMinutes < 15 * 60 + 30) return "lunch";
  if (localMinutes >= 18 * 60 + 30 && localMinutes < 23 * 60) return "dinner";
  return "snack";
}

// --- Search ranking ----------------------------------------------------------

export type FoodSource = "user" | "recipe" | "indb" | "usda_foundation" | "usda_sr" | "off";

/** Your own first, then Indian verified data, then USDA, then crowd-sourced packaged foods. */
const SOURCE_BONUS: Record<FoodSource, number> = {
  user: 0.4,
  recipe: 0.4,
  indb: 0.2,
  usda_foundation: 0.12,
  usda_sr: 0.08,
  off: 0,
};

export interface SearchCandidate {
  id: string;
  name: string;
  source: FoodSource;
  /** pg_trgm similarity of the query to search_text, 0–1. */
  similarity: number;
  /** Whether full-text matched every query word. */
  allWords: boolean;
  /** Times the athlete logged it in the last 90 days. */
  timesLogged: number;
  favourite: boolean;
}

/**
 * Relevance first; source, habit and favourites break near-ties. A weak
 * match of your own food can't beat a strong USDA match: the bonuses are
 * smaller than the gap between a good and a poor match.
 */
export function rankScore(c: SearchCandidate, query: string): number {
  const q = query.trim().toLowerCase();
  const name = c.name.toLowerCase();
  let s = c.similarity;
  if (c.allWords) s += 0.25;
  if (name === q) s += 0.5;
  else if (name.startsWith(q)) s += 0.1;
  s += SOURCE_BONUS[c.source];
  s += Math.min(0.3, Math.log1p(c.timesLogged) * 0.1);
  if (c.favourite) s += 0.15;
  // Long, qualified names ("Beverages, coffee, brewed, prepared with tap water, decaffeinated") read worse.
  s -= Math.min(0.15, Math.max(0, name.length - 40) / 400);
  return Math.round(s * 1000) / 1000;
}

export function rankCandidates<T extends SearchCandidate>(cands: T[], query: string, limit = 25): T[] {
  return [...cands]
    .map((c) => ({ c, s: rankScore(c, query) }))
    .sort((a, b) => b.s - a.s || a.c.name.length - b.c.name.length)
    .slice(0, limit)
    .map((x) => x.c);
}

/** What search matches on: name, brand and aliases, lower-cased, single-spaced. */
export function searchText(name: string, brand?: string | null, aliases: string[] = []): string {
  return [name, brand ?? "", ...aliases]
    .join(" ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}%.]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
