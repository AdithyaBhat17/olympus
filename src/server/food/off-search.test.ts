import { describe, expect, it } from "vitest";
import { offSearch, pickOffMatch } from "./off-search";

// Shapes copied from a real search.openfoodfacts.org response.
const biozyme = { code: "8906116956571", product_name: "Muscleblaze Biozyme Whey", brands: ["Muscleblaze"], nutriments: { "energy-kcal_100g": 387, proteins_100g: 64.9, carbohydrates_100g: 19, fat_100g: 5.66 }, serving_quantity: 33, serving_size: "33 g" };
const junk = { code: "8906067029959", product_name: "Muscleblaze", brands: null, nutriments: { "energy-kcal_100g": 0, proteins_100g: 46.67, carbohydrates_100g: 0, fat_100g: 0.35 } };
const other = { code: "1", product_name: "Biozorb Performance Whey", brands: ["Muscleblaze"], nutriments: { "energy-kcal_100g": 386, proteins_100g: 69.4, carbohydrates_100g: 15.5, fat_100g: 5.5 } };

describe("pickOffMatch", () => {
  it("takes the hit whose brand and name hold every query word, mapped per 100 g", () => {
    const m = pickOffMatch("muscleblaze biozyme whey", [junk, biozyme, other]);
    expect(m?.food).toMatchObject({ source: "off", sourceId: "8906116956571", name: "Muscleblaze Biozyme Whey", brand: "Muscleblaze", kcal100g: 387, protein100g: 64.9, servingG: 33 });
  });

  it("skips a hit with 0 kcal and a lot of protein (junk data)", () => {
    expect(pickOffMatch("muscleblaze", [junk])).toBeNull();
  });

  it("skips macros that don't match the calories", () => {
    const bad = { ...biozyme, nutriments: { ...biozyme.nutriments, "energy-kcal_100g": 150 } };
    expect(pickOffMatch("muscleblaze biozyme whey", [bad])).toBeNull();
  });

  it("is for branded products: a generic query never becomes some brand's product", () => {
    const sachet = { code: "2", product_name: "Instant Masala Chai Premix", brands: ["Tata Tea"], nutriments: { "energy-kcal_100g": 410, proteins_100g: 3, carbohydrates_100g: 88, fat_100g: 5 } };
    expect(pickOffMatch("masala chai", [sachet])).toBeNull();
    expect(pickOffMatch("tata masala chai", [sachet])?.food.brand).toBe("Tata Tea");
  });

  it("needs every word: a close product is not the product", () => {
    expect(pickOffMatch("muscleblaze isolate", [biozyme, other])).toBeNull();
    expect(pickOffMatch("", [biozyme])).toBeNull();
  });
});

describe("offSearch", () => {
  it("returns hits, and [] when the request fails or the body is odd", async () => {
    const ok = async () => new Response(JSON.stringify({ hits: [biozyme] }));
    expect(await offSearch("x", ok as unknown as typeof fetch)).toHaveLength(1);
    expect(await offSearch("x", (async () => new Response("no", { status: 503 })) as unknown as typeof fetch)).toEqual([]);
    expect(await offSearch("x", (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toEqual([]);
    expect(await offSearch("x", (async () => new Response(JSON.stringify({ hits: "nope" }))) as unknown as typeof fetch)).toEqual([]);
  });
});
