import { describe, expect, it } from "vitest";
import {
  atwaterGap,
  dayTotals,
  forGrams,
  mealForTime,
  rankCandidates,
  matchCoverage,
  isStrongMatch,
  rankScore,
  recipePer100,
  remaining,
  searchText,
  type SearchCandidate,
} from "../nutrition";

const chicken = { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fibre: 0 };
const rice = { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fibre: 0.4 };

describe("forGrams", () => {
  it("scales per-100 g values", () => {
    expect(forGrams(chicken, 150)).toEqual({ kcal: 247.5, protein: 46.5, carbs: 0, fat: 5.4, fibre: 0 });
  });
  it("treats unknown nutrients as zero and negative grams as none", () => {
    expect(forGrams({ kcal: 100, protein: null, carbs: null, fat: null, fibre: null }, 50)).toEqual({
      kcal: 50,
      protein: 0,
      carbs: 0,
      fat: 0,
      fibre: 0,
    });
    expect(forGrams(chicken, -10).kcal).toBe(0);
  });
});

describe("dayTotals + remaining", () => {
  const items = [
    { ...forGrams(chicken, 200), countsToProtein: true },
    { kcal: 40, protein: 10, carbs: 0, fat: 0, fibre: 0, countsToProtein: false }, // collagen
  ];

  it("keeps collagen protein off the floor but in the kcal", () => {
    const t = dayTotals(items);
    expect(t.kcal).toBe(370);
    expect(t.protein).toBe(72);
    expect(t.proteinCounted).toBe(62);
    expect(t.proteinExcluded).toBe(10);
  });

  it("never adds exercise: remaining is target minus eaten", () => {
    const r = remaining(dayTotals(items), { kcalTarget: 1700, proteinTarget: 155 });
    expect(r).toEqual({ kcal: 1330, protein: 93, proteinPct: 40, kcalPct: 22 });
  });

  it("goes negative over budget, protein floors at 0", () => {
    const big = dayTotals([{ kcal: 1900, protein: 170, carbs: 0, fat: 0, fibre: 0, countsToProtein: true }]);
    expect(remaining(big, { kcalTarget: 1700, proteinTarget: 155 })).toMatchObject({ kcal: -200, protein: 0 });
    expect(remaining(big, { kcalTarget: null, proteinTarget: null })).toEqual({
      kcal: null,
      protein: null,
      proteinPct: null,
      kcalPct: null,
    });
  });
});

describe("recipePer100", () => {
  it("divides ingredient totals by the cooked yield", () => {
    // 100 g dry toor dal + 10 g ghee, cooked to 400 g.
    const dal = { kcal: 343, protein: 22.3, carbs: 57.6, fat: 1.7, fibre: 15 };
    const ghee = { kcal: 900, protein: 0, carbs: 0, fat: 100, fibre: 0 };
    const r = recipePer100(
      [
        { food: dal, grams: 100 },
        { food: ghee, grams: 10 },
      ],
      400
    );
    expect(r.kcal).toBe(108.25);
    expect(r.protein).toBe(5.58);
    expect(r.fat).toBe(2.93);
    expect(r.rawG).toBe(110);
    expect(r.yieldG).toBe(400);
  });

  it("uses the raw weight without a yield, and survives no ingredients", () => {
    expect(recipePer100([{ food: rice, grams: 200 }]).kcal).toBe(130);
    expect(recipePer100([]).kcal).toBe(0);
  });
});

describe("atwaterGap", () => {
  it("flags foods whose kcal don't match their macros", () => {
    expect(atwaterGap(chicken)!).toBeLessThan(0.1);
    expect(atwaterGap({ kcal: 500, protein: 10, carbs: 10, fat: 1, fibre: 0 })!).toBeGreaterThan(0.5);
    expect(atwaterGap({ kcal: 100, protein: null, carbs: 1, fat: 1, fibre: 0 })).toBeNull();
  });
});

describe("mealForTime", () => {
  it("maps local time to a default meal", () => {
    expect(mealForTime(8 * 60)).toBe("breakfast");
    expect(mealForTime(13 * 60)).toBe("lunch");
    expect(mealForTime(17 * 60)).toBe("snack");
    expect(mealForTime(20 * 60 + 30)).toBe("dinner");
    expect(mealForTime(23 * 60 + 30)).toBe("snack");
  });
});

describe("search ranking", () => {
  const c = (over: Partial<SearchCandidate>): SearchCandidate => ({
    id: Math.random().toString(),
    name: "x",
    source: "usda_sr",
    similarity: 0.5,
    allWords: true,
    timesLogged: 0,
    favourite: false,
    ...over,
  });

  it("puts my dal above the database's dal when both match well", () => {
    const mine = c({ name: "Home toor dal", source: "recipe", similarity: 0.5 });
    const db = c({ name: "Toor dal (Arhar dal)", source: "indb", similarity: 0.55 });
    expect(rankCandidates([db, mine], "toor dal")[0]).toBe(mine);
  });

  it("but a weak match of my own food doesn't beat a strong one", () => {
    const mine = c({ name: "Chicken biryani (home)", source: "user", similarity: 0.15, allWords: false });
    const usda = c({ name: "Rice, white, cooked", source: "usda_sr", similarity: 0.7 });
    expect(rankCandidates([mine, usda], "white rice cooked")[0]).toBe(usda);
  });

  it("an exact alias wins over dishes that merely start with the word", () => {
    const yogurt = c({ name: "Yogurt, plain, whole milk", source: "usda_sr", similarity: 1, aliasExact: true });
    const dip = c({ name: "Curd dip", source: "indb", similarity: 1 });
    expect(rankCandidates([dip, yogurt], "curd")[0]).toBe(yogurt);
  });

  it("logging prefers cooked over raw unless raw was said", () => {
    const raw = c({ name: "Chicken, thigh, meat and skin, raw", similarity: 0.6 });
    const cooked = c({ name: "Chicken, thigh, meat and skin, cooked, roasted", similarity: 0.55 });
    expect(rankCandidates([raw, cooked], "chicken thigh", 2, { preferCooked: true })[0]).toBe(cooked);
    expect(rankCandidates([raw, cooked], "chicken thigh raw", 2, { preferCooked: true })[0]).toBe(raw);
    expect(rankCandidates([raw, cooked], "chicken thigh")[0]).toBe(raw);
  });

  it("but fruit stays raw: 'banana' is a banana, not banana appam", () => {
    const banana = c({ name: "Bananas, raw", source: "usda_sr", similarity: 1, aliasExact: true, category: "Fruits and Fruit Juices" });
    const appam = c({ name: "Banana appam", source: "indb", similarity: 1 });
    expect(rankCandidates([appam, banana], "banana", 2, { preferCooked: true })[0]).toBe(banana);
    const apple = c({ name: "Apples, raw, with skin", source: "usda_sr", similarity: 0.6, category: "Fruits and Fruit Juices" });
    const pie = c({ name: "Apple pie", source: "usda_sr", similarity: 0.55 });
    expect(rankCandidates([pie, apple], "apples", 2, { preferCooked: true })[0]).toBe(apple);
  });

  it("exact names, habit and favourites lift results", () => {
    expect(rankScore(c({ name: "egg" }), "egg")).toBeGreaterThan(rankScore(c({ name: "egg, whole, raw" }), "egg"));
    expect(rankScore(c({ timesLogged: 20 }), "x")).toBeGreaterThan(rankScore(c({}), "x"));
    expect(rankScore(c({ favourite: true }), "x")).toBeGreaterThan(rankScore(c({}), "x"));
  });

  it("a candidate missing the food itself loses: 'masala chai' is tea, not masala chops", () => {
    const chops = c({ name: "Dry masala chops", source: "indb", similarity: 0.75, allWords: false, text: "dry masala chops" });
    const chai = c({ name: "Hot tea (Garam Chai)", source: "indb", similarity: 0.4, allWords: false, text: "hot tea garam chai garam chai" });
    expect(rankCandidates([chops, chai], "masala chai")[0]).toBe(chai);
  });

  it("an exact alias still beats rows that merely contain every word ('egg' is not dried egg yolk)", () => {
    const egg = c({ name: "Egg, whole, raw, fresh", source: "usda_foundation", similarity: 1, aliasExact: true, category: "Dairy and Egg Products", text: "egg whole raw fresh egg eggs anda whole egg" });
    const yolk = c({ name: "Egg, yolk, dried", source: "usda_foundation", similarity: 1, text: "egg yolk dried" });
    expect(rankCandidates([yolk, egg], "egg", 2, { preferCooked: true })[0]).toBe(egg);
  });

  it("the food word must lead the candidate's name: 'whole milk' is milk, not yogurt made with whole milk", () => {
    const yogurt = c({ name: "Yogurt, plain, whole milk", source: "usda_foundation", similarity: 1, text: "yogurt plain whole milk dahi curd" });
    const milk = c({ name: "Milk, whole, 3.25% milkfat, with added vitamin D", source: "usda_foundation", similarity: 0.6, text: "milk whole 3.25% milkfat with added vitamin d milk full cream milk doodh" });
    expect(rankCandidates([yogurt, milk], "whole milk", 2, { preferCooked: true })[0]).toBe(milk);
    // "Beverages, coffee, …" and "Cheese, paneer": the food is in the first two parts.
    expect(matchCoverage(c({ name: "Beverages, coffee, brewed", text: "beverages coffee brewed" }), "coffee").lead).toBe(true);
    expect(matchCoverage(c({ name: "Cheese, paneer", text: "cheese paneer" }), "paneer").lead).toBe(true);
    expect(matchCoverage(c({ name: "Yogurt, plain, whole milk", text: "yogurt plain whole milk" }), "milk").lead).toBe(false);
  });

  it("a curated alias beats another source's food of the same name ('dal' is everyday dal)", () => {
    const mixed = c({ name: "Mixed dal", source: "indb", similarity: 1, aliasExact: true, text: "mixed dal dal plain dal" });
    const fndds = c({ name: "Dal", source: "usda_fndds", similarity: 1, text: "dal" });
    expect(rankCandidates([fndds, mixed], "dal", 2, { preferCooked: true })[0]).toBe(mixed);
  });

  it("only the food word counts as the head: trailing 'cooked' or 'raw' doesn't", () => {
    expect(matchCoverage(c({ text: "rice white long grain regular enriched cooked" }), "rice cooked")).toMatchObject({ head: true, share: 1 });
    expect(matchCoverage(c({ text: "chapati roti roti chapati phulka rotis chapatis" }), "rotis")).toMatchObject({ head: true });
    expect(matchCoverage(c({ text: "dry masala chops" }), "masala chai")).toMatchObject({ share: 0.5, head: false });
  });

  it("a match without the food word is weak, so the draft says 'no match' instead of guessing", () => {
    expect(isStrongMatch(c({ text: "dry masala chops" }), "masala chai")).toBe(false);
    expect(isStrongMatch(c({ text: "hot tea garam chai" }), "masala chai")).toBe(true);
    expect(isStrongMatch(c({ text: "guacamole" }), "guacamole")).toBe(true);
    expect(isStrongMatch(c({ text: "avocados raw california" }), "guacamole")).toBe(false);
    // An exact alias is always strong; without search text there's nothing to judge.
    expect(isStrongMatch(c({ text: "mixed dal dal", aliasExact: true }), "dal")).toBe(true);
    expect(isStrongMatch(c({}), "anything")).toBe(true);
  });

  it("puts doubtful data below the same match from a sound row", () => {
    expect(rankScore(c({ verified: false }), "x")).toBeLessThan(rankScore(c({}), "x"));
    expect(rankScore(c({ verified: false }), "x")).toBeLessThan(rankScore(c({ verified: true }), "x"));
  });
});

describe("searchText", () => {
  it("normalises name, brand and aliases", () => {
    expect(searchText("Paneer Tikka (Café)", "Haldiram's", ["cottage cheese"])).toBe(
      "paneer tikka cafe haldiram s cottage cheese"
    );
  });
});
