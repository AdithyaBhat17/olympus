import { describe, expect, it } from "vitest";
import {
  checkTiming,
  daysLeft,
  effectiveRules,
  isScheduled,
  labChecklist,
  nudgeSummary,
  nudgeText,
  retestDue,
  scheduleLabel,
  servingsLeft,
  weekday,
  type TimingRule,
} from "../supplements";

const rules: TimingRule[] = [
  { key: "levo-food", subjectTag: "levothyroxine", objectTag: "food", minGapMin: 30, direction: "after", message: "m1", citation: "c1" },
  { key: "levo-coffee", subjectTag: "levothyroxine", objectTag: "coffee", minGapMin: 60, direction: "after", message: "m2", citation: "c2" },
  { key: "levo-calcium", subjectTag: "levothyroxine", objectTag: "calcium", minGapMin: 240, direction: "either", message: "m3", citation: "c3" },
];
const t = (hhmm: string) => Date.parse(`2026-11-03T${hhmm}:00Z`);
const levo = { id: "levo", at: t("06:30"), tags: ["levothyroxine"], label: "Thyronorm" };

describe("scheduling", () => {
  it("knows weekdays and the D3-on-Saturday case", () => {
    expect(weekday("2026-11-07")).toBe(6);
    expect(isScheduled([6], "2026-11-07")).toBe(true);
    expect(isScheduled([6], "2026-11-08")).toBe(false);
    expect(isScheduled([], "2026-11-08")).toBe(true);
    expect(scheduleLabel([6])).toBe("Sat");
    expect(scheduleLabel([])).toBe("Daily");
  });
});

describe("checkTiming", () => {
  it("is quiet for the athlete's real routine: med on waking, coffee 3–4 h later", () => {
    const coffee = { id: "c", at: t("10:00"), tags: ["food", "coffee"], label: "Coffee" };
    expect(checkTiming(rules, [coffee], [levo])).toEqual([]);
  });

  it("nudges coffee 25 min after the med, with the rule's source", () => {
    const coffee = { id: "c", at: t("06:55"), tags: ["food", "coffee"], label: "Coffee" };
    const n = checkTiming(rules, [coffee], [levo]);
    expect(n.map((x) => x.ruleKey).sort()).toEqual(["levo-coffee", "levo-food"]);
    expect(n[0]).toMatchObject({ gapMin: 25, subject: "Thyronorm", object: "Coffee" });
    expect(nudgeText(n.find((x) => x.ruleKey === "levo-coffee")!)).toBe(
      "Thyronorm and Coffee were 25 min apart; about 1 h is usually suggested. m2"
    );
  });

  it("names the item that triggered each rule, not just the meal", () => {
    const meal = { id: "m", at: t("06:50"), tags: ["food", "coffee", "calcium_rich"], label: "Breakfast", labels: { coffee: "coffee", calcium_rich: "milk" } };
    const r2 = [...rules, { key: "levo-ca-food", subjectTag: "levothyroxine", objectTag: "calcium_rich", minGapMin: 240, direction: "either" as const, message: "", citation: "" }];
    const byKey = Object.fromEntries(checkTiming(r2, [meal], [levo]).map((n) => [n.ruleKey, n.object]));
    expect(byKey).toEqual({ "levo-food": "Breakfast", "levo-coffee": "coffee", "levo-ca-food": "milk" });
  });

  it("'after' rules ignore food eaten before the med; 'either' rules check both ways", () => {
    const dinner = { id: "d", at: t("05:00"), tags: ["food"], label: "Late snack" };
    expect(checkTiming(rules, [dinner], [levo])).toEqual([]);
    const calcium = { id: "ca", at: t("04:00"), tags: ["calcium"], label: "Calcium" };
    expect(checkTiming(rules, [calcium], [levo]).map((n) => n.ruleKey)).toEqual(["levo-calcium"]);
  });

  it("only reports pairs that involve something just logged", () => {
    const coffee = { id: "c", at: t("06:40"), tags: ["coffee"], label: "Coffee" };
    expect(checkTiming(rules, [], [levo, coffee])).toEqual([]);
  });

  it("applies a user's override by key and drops disabled rules", () => {
    const rows = [
      { ...rules[1], userId: null, enabled: true },
      { ...rules[1], minGapMin: 30, userId: "u", enabled: true },
      { ...rules[0], userId: "u", enabled: false },
    ];
    const eff = effectiveRules(rows);
    expect(eff).toHaveLength(1);
    expect(eff[0].minGapMin).toBe(30);
  });
});

describe("nudgeSummary", () => {
  const n = (object: string, gapMin: number, suggestedMin: number) => ({ ruleKey: object, message: "m", citation: "c", gapMin, suggestedMin, subject: "Thyronorm", object });
  it("says nothing, one full nudge, or one calm line for many", () => {
    expect(nudgeSummary([])).toBeNull();
    expect(nudgeSummary([n("coffee", 25, 60)])).toContain("Thyronorm and coffee were 25 min apart");
    expect(nudgeSummary([n("dahi", 16, 240), n("milk", 21, 240), n("soya roti", 21, 120)])).toBe(
      "Thyronorm was 16 min–21 min from dahi, milk and soya roti. These are usually spaced 2 h–4 h apart; details and sources are under Supplements › Timing rules."
    );
  });
});

describe("inventory", () => {
  it("replays restocks, counts and doses", () => {
    expect(
      servingsLeft([
        { at: 1, kind: "restock", servings: 60 },
        { at: 2, kind: "dose", servings: 2 },
        { at: 3, kind: "dose", servings: 2 },
        { at: 4, kind: "count", servings: 50 },
        { at: 5, kind: "dose", servings: 1 },
      ])
    ).toBe(49);
    expect(servingsLeft([{ at: 1, kind: "dose", servings: 1 }])).toBeNull();
  });

  it("turns servings into days at the scheduled rate", () => {
    expect(daysLeft(20, 2, [])).toBe(10); // magnesium: 2 tablets a day
    expect(daysLeft(4, 1, [6])).toBe(28); // D3: once a week
    expect(daysLeft(null, 1, [])).toBeNull();
  });
});

describe("labs", () => {
  it("computes retest due dates", () => {
    expect(retestDue("25OHD", "2026-09-01")).toBe("2026-11-30");
    expect(retestDue("NOPE", "2026-09-01")).toBeNull();
    expect(retestDue("TSH", null)).toBeNull();
  });

  it("builds the pre-test checklist: biotin pause, no training before hs-CRP, thyroid dose note", () => {
    const at = Date.parse("2026-12-10T08:00:00Z");
    const items = labChecklist({ at, markers: ["TSH", "FT4", "HSCRP"], fasting: true, thyroidMedInstruction: "take it after the draw" }, [
      { name: "Naturelo One Daily", tags: ["multivitamin", "biotin"] },
      { name: "Creatine", tags: ["creatine"] },
    ]);
    expect(items.map((i) => Math.round((at - i.from) / 3_600_000))).toEqual([72, 48, 24, 12]);
    expect(items[0].text).toContain("Pause Naturelo One Daily");
    expect(items[0].source).toContain("JAMA 2017");
    expect(items[2].text).toBe("Thyroid medicine on test day: take it after the draw");
  });

  it("asks for the doctor's instruction when there isn't one, and skips what doesn't apply", () => {
    const items = labChecklist({ at: 0, markers: ["25OHD"], fasting: false }, [{ name: "D3", tags: ["vitamin_d"] }]);
    expect(items).toEqual([]);
    const thy = labChecklist({ at: 0, markers: ["TSH"], fasting: false }, []);
    expect(thy).toHaveLength(1);
    expect(thy[0].text).toContain("ask your doctor");
  });
});
