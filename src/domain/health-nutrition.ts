/**
 * Daily nutrition read from Apple Health (MyFitnessPal writes it there). The
 * app reads every dietary type it can and sends the ones that have data, so
 * what MFP happens to write decides what shows up: nothing here assumes
 * micronutrients are present.
 *
 * Keys are the wire names in the ingest body and in health_nutrition_days.
 * `max` is a sanity cap per day: a typo in MFP shouldn't poison a day.
 */

export const HEALTH_NUTRIENTS = {
  kcal: { unit: "kcal", max: 20000 },
  proteinG: { unit: "g", max: 1000 },
  carbsG: { unit: "g", max: 2000 },
  fatG: { unit: "g", max: 1000 },
  satFatG: { unit: "g", max: 500 },
  monoFatG: { unit: "g", max: 500 },
  polyFatG: { unit: "g", max: 500 },
  fibreG: { unit: "g", max: 300 },
  sugarG: { unit: "g", max: 1500 },
  cholesterolMg: { unit: "mg", max: 20000 },
  sodiumMg: { unit: "mg", max: 50000 },
  potassiumMg: { unit: "mg", max: 20000 },
  calciumMg: { unit: "mg", max: 20000 },
  ironMg: { unit: "mg", max: 1000 },
  magnesiumMg: { unit: "mg", max: 5000 },
  zincMg: { unit: "mg", max: 500 },
  phosphorusMg: { unit: "mg", max: 20000 },
  vitaminAMcg: { unit: "mcg", max: 100000 },
  vitaminCMg: { unit: "mg", max: 20000 },
  vitaminDMcg: { unit: "mcg", max: 5000 },
  vitaminEMg: { unit: "mg", max: 2000 },
  vitaminKMcg: { unit: "mcg", max: 20000 },
  vitaminB6Mg: { unit: "mg", max: 1000 },
  vitaminB12Mcg: { unit: "mcg", max: 20000 },
  folateMcg: { unit: "mcg", max: 20000 },
  caffeineMg: { unit: "mg", max: 5000 },
} as const;

export type HealthNutrientKey = keyof typeof HEALTH_NUTRIENTS;
export const HEALTH_NUTRIENT_KEYS = Object.keys(HEALTH_NUTRIENTS) as [HealthNutrientKey, ...HealthNutrientKey[]];

export type HealthNutrition = Partial<Record<HealthNutrientKey, number>>;

/**
 * True when Health has a real day of food: calories. MFP writes energy with
 * every entry; protein, caffeine or a vitamin alone is a shake, a scale app
 * or a supplement, and must not hide the food log.
 */
export function hasLoggedFood(n: HealthNutrition | null | undefined): boolean {
  return !!n && (n.kcal ?? 0) >= 1;
}

export interface FoodLogDay {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fibreG: number;
}

export type NutritionSource = "apple_health" | "food_log";

export interface DayNutrition {
  source: NutritionSource;
  nutrients: HealthNutrition;
  /** The other source, when it holds a different day, so the UI can show the gap. */
  other: { source: NutritionSource; nutrients: HealthNutrition } | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function fromFoodLog(f: FoodLogDay): HealthNutrition {
  return { kcal: Math.round(f.kcal), proteinG: r1(f.proteinG), carbsG: r1(f.carbsG), fatG: r1(f.fatG), fibreG: r1(f.fibreG) };
}

/**
 * One day, one source. Apple Health (MFP's database) wins when it has logged
 * food; the Olympus food log is the fallback. They are never added together:
 * a meal logged in both would count twice, and nothing can tell which.
 * Returns null when neither has anything.
 */
export function resolveDayNutrition(health: HealthNutrition | null | undefined, foodLog: FoodLogDay | null | undefined): DayNutrition | null {
  const log = foodLog && (foodLog.kcal > 0 || foodLog.proteinG > 0) ? fromFoodLog(foodLog) : null;
  if (hasLoggedFood(health)) {
    return { source: "apple_health", nutrients: health!, other: log ? { source: "food_log", nutrients: log } : null };
  }
  if (log) return { source: "food_log", nutrients: log, other: null };
  return null;
}
