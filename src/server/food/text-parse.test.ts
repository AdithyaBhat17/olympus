import { describe, expect, it } from "vitest";
import { chooseGrams, cleanItem, isParseResult, parsePrompt, type ParsedItem } from "./text-parse";

const item = (over: Partial<ParsedItem>): ParsedItem => ({
  name: "roti",
  search: "roti",
  quantity: 2,
  unit: "roti",
  grams: 80,
  confidence: 0.7,
  ...over,
});

describe("isParseResult", () => {
  it("accepts the schema and rejects anything else", () => {
    expect(isParseResult({ items: [item({})] })).toBe(true);
    expect(isParseResult({ items: [{ ...item({}), grams: "80" }] })).toBe(false);
    expect(isParseResult({ foods: [] })).toBe(false);
    expect(isParseResult(null)).toBe(false);
  });
});

describe("cleanItem", () => {
  it("normalises and clamps", () => {
    expect(cleanItem(item({ name: " Chicken Tikka ", search: "", grams: 150.4, confidence: 3 }))).toEqual({
      name: "chicken tikka",
      search: "chicken tikka",
      quantity: 2,
      unit: "roti",
      grams: 150,
      confidence: 1,
    });
  });
  it("drops unusable items", () => {
    expect(cleanItem(item({ grams: 0 }))).toBeNull();
    expect(cleanItem(item({ grams: 10_000 }))).toBeNull();
    expect(cleanItem(item({ name: "  " }))).toBeNull();
  });
});

describe("chooseGrams", () => {
  const rotiPortions = [{ label: "1 roti", grams: 38 }];

  it("a stated weight wins", () => {
    expect(chooseGrams(item({ unit: "g", quantity: 150, grams: 140 }), [], 200)).toEqual({ grams: 150, basis: "stated" });
  });

  it("then the athlete's usual portion", () => {
    expect(chooseGrams(item({ unit: "serving", quantity: 1, grams: 150 }), [], 180)).toEqual({ grams: 180, basis: "usual" });
  });

  it("then the database portion for the unit used, times the quantity", () => {
    expect(chooseGrams(item({}), rotiPortions, null)).toEqual({ grams: 76, basis: "portion" });
    expect(chooseGrams(item({ unit: "rotis" }), rotiPortions, null)).toEqual({ grams: 76, basis: "portion" });
  });

  it("then the model's estimate", () => {
    expect(chooseGrams(item({ unit: "katori", quantity: 1, grams: 150 }), rotiPortions, null)).toEqual({ grams: 150, basis: "estimate" });
    expect(chooseGrams(item({ unit: "serving", quantity: 1, grams: 120 }), rotiPortions, null)).toEqual({ grams: 120, basis: "estimate" });
  });
});

describe("parsePrompt", () => {
  it("includes usual portions and never asks for calories", () => {
    const [system, user] = parsePrompt("2 rotis and dal", [{ name: "Home toor dal", grams: 180, times: 9 }]);
    expect(system.content).toContain("Home toor dal: 180 g");
    expect(system.content).toContain("Never estimate calories");
    expect(user.content).toBe("2 rotis and dal");
  });
});
