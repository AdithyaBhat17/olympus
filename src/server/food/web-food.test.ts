import { describe, expect, it } from "vitest";
import { isWebFoodAnswer, toWebFood, webFoodPrompt, type WebFoodAnswer } from "./web-food";

const whey: WebFoodAnswer = {
  found: true, name: "Whey Protein Isolate", brand: "Acme", amount: 30, unit: "g", gramsPerMl: 0,
  kcal: 120, protein: 25, carbs: 2, fat: 1, fibre: 0, servingLabel: "1 scoop", servingG: 30,
  sourceUrl: "https://www.acme.in/whey",
};

describe("toWebFood", () => {
  it("converts a per-serving label to per 100 g", () => {
    const r = toWebFood(whey, ["https://acme.in/whey/"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.food).toMatchObject({ kcal100g: 400, protein100g: 83.33, carbs100g: 6.67, fat100g: 3.33, servingG: 30, servingLabel: "1 scoop", brand: "Acme" });
  });

  it("converts per-ml numbers using the density", () => {
    const milk = { ...whey, name: "Toned milk", brand: "", unit: "ml" as const, amount: 100, gramsPerMl: 1.03, kcal: 58, protein: 3, carbs: 4.7, fat: 3, servingG: 0, servingLabel: "" };
    const r = toWebFood(milk, []);
    expect(r.ok && r.food.kcal100g).toBeCloseTo(56.31, 1);
    expect(r.ok && r.food.servingG).toBeNull();
  });

  it("refuses a source the search never returned", () => {
    expect(toWebFood(whey, ["https://other.com/page"])).toEqual({ ok: false, reason: "source wasn't in the search results" });
  });

  it("refuses not-found, no https source and impossible values", () => {
    expect(toWebFood({ ...whey, found: false }, [])).toMatchObject({ ok: false });
    expect(toWebFood({ ...whey, sourceUrl: "" }, [])).toMatchObject({ ok: false });
    expect(toWebFood({ ...whey, kcal: 900 }, [])).toMatchObject({ ok: false }); // 3000 kcal per 100 g
    expect(toWebFood({ ...whey, protein: 40, amount: 30 }, [])).toMatchObject({ ok: false }); // >100 g protein per 100 g
  });

  it("refuses macros that don't match the calories (a misread column)", () => {
    expect(toWebFood({ ...whey, kcal: 250 }, [])).toEqual({ ok: false, reason: "macros don't match the calories" });
  });

  it("allows label rounding on small foods", () => {
    const diet = { ...whey, amount: 100, kcal: 4, protein: 0, carbs: 0.5, fat: 0, servingG: 0, servingLabel: "" };
    expect(toWebFood(diet, []).ok).toBe(true);
  });
});

describe("isWebFoodAnswer / prompt", () => {
  it("validates the schema shape", () => {
    expect(isWebFoodAnswer(whey)).toBe(true);
    expect(isWebFoodAnswer({ ...whey, unit: "oz" })).toBe(false);
    expect(isWebFoodAnswer({ ...whey, kcal: "120" })).toBe(false);
  });
  it("asks for printed numbers only", () => {
    const [system, user] = webFoodPrompt("muscleblaze whey");
    expect(system.content).toMatch(/Never recall them from memory/);
    expect(user.content).toBe("muscleblaze whey");
  });
});
