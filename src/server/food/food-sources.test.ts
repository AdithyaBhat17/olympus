import { describe, expect, it } from "vitest";
import { indbFood, offFood, tagsFor, usdaFood } from "./sources";
import { mapMeal, parseCsv, parseMfpMeasurements, parseMfpNutrition, to24h } from "./mfp";

const nut = (id: number, amount: number) => ({ nutrient: { id }, amount });

describe("usdaFood", () => {
  it("maps SR Legacy nutrients, portions and micros", () => {
    const m = usdaFood(
      {
        fdcId: 168878,
        description: "Rice, white, long-grain, regular, enriched, cooked",
        foodCategory: { description: "Cereal Grains and Pasta" },
        foodNutrients: [nut(1008, 130), nut(1003, 2.69), nut(1005, 28.17), nut(1004, 0.28), nut(1079, 0.4), nut(1087, 10), nut(1093, 1)],
        foodPortions: [
          { amount: 1, measureUnit: { name: "cup" }, modifier: "", gramWeight: 158 },
          { amount: 1, measureUnit: { name: "undetermined" }, modifier: "serving", gramWeight: 34 },
        ],
      },
      "usda_sr"
    )!;
    expect(m.food).toMatchObject({
      source: "usda_sr",
      sourceId: "168878",
      kcal100g: 130,
      protein100g: 2.69,
      carbs100g: 28.17,
      fat100g: 0.28,
      fibre100g: 0.4,
      sodiumMg100g: 1,
      micros: { calcium_mg: 10 },
      servingG: 158,
      servingLabel: "1 cup",
      verified: true,
      category: "Cereal Grains and Pasta",
    });
    expect(m.portions).toEqual([
      { label: "1 cup", grams: 158 },
      { label: "1 serving", grams: 34 },
    ]);
    expect(m.food.searchText).toBe("rice white long grain regular enriched cooked");
  });

  it("falls back to Atwater energy (Foundation Foods) and skips foods without energy", () => {
    expect(usdaFood({ fdcId: 1, description: "Lentils, dry", foodNutrients: [nut(2048, 352), nut(2047, 343)] }, "usda_foundation")!.food.kcal100g).toBe(352);
    expect(usdaFood({ fdcId: 2, description: "Water", foodNutrients: [nut(1003, 0)] }, "usda_sr")).toBeNull();
  });
});

describe("indbFood", () => {
  const row = {
    food_code: "ASC110",
    food_name: "Arhar dal (Toor dal)",
    energy_kcal: 120,
    protein_g: 6,
    carb_g: 15,
    fat_g: 3.5,
    fibre_g: 3,
    freesugar_g: 0.5,
    sodium_mg: 250,
    calcium_mg: 30,
    iron_mg: 1.2,
    sfa_mg: 1500,
    servings_unit: "katori",
    unit_serving_energy_kcal: 180,
  };

  it("maps per-100 g values, aliases from parentheses, and derives serving grams", () => {
    const m = indbFood(row)!;
    expect(m.food).toMatchObject({
      source: "indb",
      sourceId: "ASC110",
      name: "Arhar dal (Toor dal)",
      aliases: ["toor dal"],
      kcal100g: 120,
      protein100g: 6,
      carbs100g: 15,
      fat100g: 3.5,
      micros: { calcium_mg: 30, iron_mg: 1.2, satfat_g: 1.5 },
      servingG: 150,
      servingLabel: "1 katori",
    });
    expect(m.portions).toEqual([{ label: "1 katori", grams: 150 }]);
  });

  it("marks deep-fried recipes that count all the frying oil as unverified", () => {
    // INDB's poori, pakora, bhatura... carry the whole pan of oil: 70-90 g fat per 100 g.
    expect(indbFood({ ...row, food_name: "Poori", energy_kcal: 738, fat_g: 77.6 })!.food.verified).toBe(false);
    expect(indbFood({ ...row, food_name: "Paneer pulao", energy_kcal: 582, fat_g: 59.8 })!.food.verified).toBe(false);
    // Foods that really are that fatty stay verified.
    expect(indbFood({ ...row, food_name: "Mayonnaise", energy_kcal: 775, fat_g: 84.5 })!.food.verified).toBe(true);
    expect(indbFood({ ...row, food_name: "Cumin seeds baghar (Jeera baghar/tadka)", energy_kcal: 737, fat_g: 78.8 })!.food.verified).toBe(true);
    expect(indbFood(row)!.food.verified).toBe(true);
  });

  it("drops rows without a code, name or believable energy", () => {
    expect(indbFood({ ...row, food_code: "" })).toBeNull();
    expect(indbFood({ ...row, energy_kcal: 1200 })).toBeNull();
  });
});

describe("offFood", () => {
  const product = {
    code: "8901058000290",
    product_name: "Maggi 2-Minute Masala Noodles",
    brands: "Maggi, Nestlé",
    serving_quantity: 70,
    serving_size: "70 g",
    nutriments: {
      "energy-kcal_100g": 427,
      proteins_100g: 8.2,
      carbohydrates_100g: 61.6,
      fat_100g: 15.7,
      fiber_100g: 2.1,
      sodium_100g: 1.2,
      calcium_100g: 0.05,
    },
  };

  it("maps a packaged product with its barcode and serving", () => {
    const m = offFood(product)!;
    expect(m.food).toMatchObject({
      source: "off",
      sourceId: "8901058000290",
      barcode: "8901058000290",
      brand: "Maggi",
      kcal100g: 427,
      sodiumMg100g: 1200,
      micros: { calcium_mg: 50 },
      servingG: 70,
      verified: true,
    });
    expect(m.portions).toEqual([{ label: "70 g", grams: 70 }]);
  });

  it("converts kJ, and doesn't verify kcal that disagree with the macros", () => {
    const kj = offFood({ ...product, nutriments: { "energy-kj_100g": 418.4, proteins_100g: 25, carbohydrates_100g: 0, fat_100g: 0 } })!;
    expect(kj.food.kcal100g).toBe(100);
    expect(kj.food.verified).toBe(true);
    const bad = offFood({ ...product, nutriments: { "energy-kcal_100g": 50, proteins_100g: 25, carbohydrates_100g: 10, fat_100g: 10 } })!;
    expect(bad.food.verified).toBe(false);
    expect(offFood({ ...product, nutriments: {} })).toBeNull();
  });
});

describe("tagsFor", () => {
  it("tags what the thyroid timing rules care about", () => {
    expect(tagsFor("Cappuccino with milk", {}, {})).toEqual(["calcium_rich", "coffee"]);
    expect(tagsFor("Tofu, firm", {}, { calcium_mg: 350, iron_mg: 5 })).toEqual(["calcium_rich", "iron_rich", "soy"]);
    expect(tagsFor("Rajma (kidney beans), cooked", { fibre: 6.4 }, {})).toEqual(["high_fibre"]);
  });
});

describe("MFP export", () => {
  it("parses quoted CSV", () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\n')).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
    ]);
  });

  it("reads 12-hour times and maps meals", () => {
    expect(to24h("9:20 PM")).toBe("21:20");
    expect(to24h("12:05 AM")).toBe("00:05");
    expect(to24h("12:24 PM")).toBe("12:24");
    expect(to24h("")).toBeNull();
    expect(mapMeal("Evening Snacks")).toEqual({ meal: "snack", defaultTime: "17:30" });
    expect(mapMeal("Breakfast").meal).toBe("breakfast");
  });

  it("turns each nutrition row into an idempotent meal entry", () => {
    const csv = [
      "Date,Meal,Time,Calories,Fat (g),Carbohydrates (g),Fiber,Protein (g),Note",
      "2024-06-28,Breakfast,,320.0,11.0,51.1,0.0,5.6,",
      "2024-06-28,Lunch,12:24 PM,600,20,60,5,40,",
      "2024-06-28,Lunch,12:24 PM,100,0,25,0,0,",
      "not-a-date,Lunch,,1,1,1,1,1,",
    ].join("\n");
    const meals = parseMfpNutrition(csv);
    expect(meals).toHaveLength(3);
    expect(meals[0]).toMatchObject({ meal: "breakfast", time: "08:30", timeKnown: false, kcal: 320, protein: 5.6, externalRef: "mfp:2024-06-28:Breakfast:-" });
    expect(meals[1]).toMatchObject({ time: "12:24", timeKnown: true, protein: 40, externalRef: "mfp:2024-06-28:Lunch:12:24" });
    expect(meals[2].externalRef).toBe("mfp:2024-06-28:Lunch:12:24#2");
  });

  it("reads weigh-ins and body fat", () => {
    const csv = "Date,Body Fat %,Hips,Neck,Waist,Weight\n2022-06-12,,,,,74.0\n2024-07-01,18.5,,,82,80.2\n2024-07-02,,,,,\n";
    expect(parseMfpMeasurements(csv)).toEqual([
      { date: "2022-06-12", kg: 74, bodyFatPct: null, waistCm: null, neckCm: null, hipsCm: null },
      { date: "2024-07-01", kg: 80.2, bodyFatPct: 18.5, waistCm: 82, neckCm: null, hipsCm: null },
    ]);
  });
});
