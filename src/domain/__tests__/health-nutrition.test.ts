import { describe, expect, it } from "vitest";
import { hasLoggedFood, resolveDayNutrition } from "../health-nutrition";

const log = { kcal: 1800, proteinG: 120, carbsG: 200, fatG: 60, fibreG: 25 };

describe("resolveDayNutrition", () => {
  it("prefers Apple Health when it has a logged day", () => {
    const r = resolveDayNutrition({ kcal: 2100, proteinG: 140, sodiumMg: 2300 }, log);
    expect(r?.source).toBe("apple_health");
    expect(r?.nutrients.sodiumMg).toBe(2300);
    expect(r?.other?.source).toBe("food_log");
  });
  it("falls back to the food log when Health has nothing", () => {
    expect(resolveDayNutrition(null, log)?.source).toBe("food_log");
    expect(resolveDayNutrition({}, log)?.source).toBe("food_log");
  });
  it("a lone caffeine or vitamin sample doesn't count as a logged day", () => {
    expect(hasLoggedFood({ caffeineMg: 95 })).toBe(false);
    expect(resolveDayNutrition({ caffeineMg: 95 }, log)?.source).toBe("food_log");
  });
  it("never adds the two together", () => {
    expect(resolveDayNutrition({ kcal: 500, proteinG: 30 }, log)?.nutrients.kcal).toBe(500);
  });
  it("is null when neither has food", () => {
    expect(resolveDayNutrition(null, null)).toBeNull();
    expect(resolveDayNutrition({}, { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0 })).toBeNull();
  });
});
