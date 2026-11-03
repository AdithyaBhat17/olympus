import { describe, expect, it } from "vitest";
import { chooseGrams, cleanItem, isParseResult, matchSupplement, parseOutcome, parsePrompt, splitByTime, type ParsedItem } from "./text-parse";

const item = (over: Partial<ParsedItem>): ParsedItem => ({
  name: "roti",
  search: "roti",
  quantity: 2,
  unit: "roti",
  grams: 80,
  confidence: 0.7,
  time: "",
  supplement: "",
  ...over,
});

describe("isParseResult", () => {
  it("accepts the schema and rejects anything else", () => {
    expect(isParseResult({ items: [item({})] })).toBe(true);
    expect(isParseResult({ items: [{ ...item({}), grams: "80" }] })).toBe(false);
    expect(isParseResult({ items: [{ ...item({}), time: undefined }] })).toBe(false);
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
      time: null,
      supplement: null,
    });
  });
  it("normalises times to HH:mm and drops impossible ones", () => {
    expect(cleanItem(item({ time: "9:30" }))?.time).toBe("09:30");
    expect(cleanItem(item({ time: "21:05" }))?.time).toBe("21:05");
    expect(cleanItem(item({ time: "25:00" }))?.time).toBeNull();
    expect(cleanItem(item({ time: "noon" }))?.time).toBeNull();
    expect(cleanItem(item({ supplement: " Thyronorm " }))?.supplement).toBe("Thyronorm");
  });
  it("keeps a supplement even without a weight (a tablet has no grams)", () => {
    expect(cleanItem(item({ name: "thyroid tablet", grams: 0, supplement: "Thyronorm" }))).toMatchObject({ supplement: "Thyronorm", grams: 0 });
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

  it("tbsp and tsp find 'tablespoon' and 'teaspoon' portions", () => {
    const guac = [{ label: "1 tablespoon", grams: 15 }, { label: "1 individual container", grams: 70 }];
    expect(chooseGrams(item({ unit: "tbsp", quantity: 2, grams: 30 }), guac, null)).toEqual({ grams: 30, basis: "portion" });
    expect(chooseGrams(item({ unit: "tsp", quantity: 1, grams: 5 }), [{ label: "1 teaspoon", grams: 4 }], null)).toEqual({ grams: 4, basis: "portion" });
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
  it("lists the supplement stack and asks for times", () => {
    const [system] = parsePrompt("at 9:30 thyroid tablet", [], [{ name: "Thyronorm", hint: "levothyroxine" }]);
    expect(system.content).toContain("- Thyronorm (levothyroxine)");
    expect(system.content).toMatch(/time: .*24-hour/);
  });
});

describe("matchSupplement", () => {
  const stack = [
    { id: "t", name: "Thyronorm" },
    { id: "w", name: "Whey protein" },
    { id: "m", name: "Magnesium glycinate" },
  ];
  it("matches the name the model returned, case-insensitively", () => {
    expect(matchSupplement("thyronorm", stack)?.id).toBe("t");
    expect(matchSupplement("Whey Protein", stack)?.id).toBe("w");
  });
  it("tolerates a shortened name, and refuses anything else", () => {
    expect(matchSupplement("magnesium", stack)?.id).toBe("m");
    expect(matchSupplement("vitamin c", stack)).toBeNull();
    expect(matchSupplement("", stack)).toBeNull();
  });
});

describe("splitByTime", () => {
  it("groups by time, in time order, untimed items in their own group first", () => {
    const groups = splitByTime([
      { id: "coffee", time: "12:00" },
      { id: "roti", time: null },
      { id: "milk", time: "12:00" },
      { id: "egg", time: "08:15" },
    ]);
    expect(groups.map((g) => [g.time, g.items.map((i) => i.id)])).toEqual([
      [null, ["roti"]],
      ["08:15", ["egg"]],
      ["12:00", ["coffee", "milk"]],
    ]);
  });
});

describe("parseOutcome", () => {
  const d = (matchId: string | null, grams: number) => ({ matchId, grams });
  const f = (foodId: string, grams: number) => ({ foodId, grams });

  it("counts kept, regrammed, swapped, removed and added", () => {
    const draft = [d("roti", 80), d("dal", 150), d("rice", 150), d("ghee", 13), d(null, 15)];
    // roti kept (82 is within 5 g), dal corrected to 200, rice swapped for brown rice, ghee removed.
    const final = [f("roti", 82), f("dal", 200), f("brown-rice", 150)];
    expect(parseOutcome(draft, final)).toEqual({ kept: 1, regrammed: 1, swapped: 1, removed: 1, added: 0 });
  });

  it("treats a small relative change on a big portion as kept, and extra foods as added", () => {
    expect(parseOutcome([d("rice", 300)], [f("rice", 320), f("pickle", 10)])).toEqual({ kept: 1, regrammed: 0, swapped: 0, removed: 0, added: 1 });
  });

  it("matches the same food twice in order", () => {
    expect(parseOutcome([d("egg", 50), d("egg", 50)], [f("egg", 50), f("egg", 100)])).toEqual({ kept: 1, regrammed: 1, swapped: 0, removed: 0, added: 0 });
  });
});
