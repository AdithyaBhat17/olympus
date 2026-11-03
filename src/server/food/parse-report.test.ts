import { describe, expect, it } from "vitest";
import type { ParseDraftItem } from "@/lib/db/schema";
import { buildParseReport, reportMarkdown, type ParseEventRow } from "./parse-report";

const d = (said: string, matchId: string | null, matchName: string | null, grams: number): ParseDraftItem => ({
  said,
  search: said,
  quantity: 1,
  unit: "serving",
  estGrams: grams,
  grams,
  basis: "estimate",
  confidence: 0.6,
  matchId,
  matchName,
  matchSource: matchId ? "indb" : null,
  alternativeIds: [],
});

const row = (over: Partial<ParseEventRow>): ParseEventRow => ({
  createdAt: new Date("2026-11-03T08:00:00Z"),
  text: "",
  client: "ios",
  model: "google/gemini-3.1-flash-lite",
  latencyMs: 1500,
  costUsd: 0.0004,
  error: null,
  draft: [],
  final: null,
  logged: false,
  unmatched: 0,
  kept: null,
  regrammed: null,
  swapped: null,
  removed: null,
  added: null,
  ...over,
});

describe("buildParseReport", () => {
  const rows = [
    row({ text: "1tbsp guac", draft: [d("guacamole", null, null, 15)], unmatched: 1 }),
    row({
      text: "2 rotis and dal, masala chai",
      latencyMs: 1200,
      draft: [d("roti", "roti", "Chapati/Roti", 80), d("dal", "moong", "Sabut moong dal", 150), d("masala chai", "chops", "Dry masala chops", 150)],
      final: [
        { foodId: "roti", name: "Chapati/Roti", grams: 80 },
        { foodId: "moong", name: "Sabut moong dal", grams: 220 },
        { foodId: "chai", name: "Tea with milk", grams: 150 },
      ],
      logged: true,
      kept: 1,
      regrammed: 1,
      swapped: 1,
      removed: 0,
      added: 0,
    }),
    row({ text: "guac and chips", model: null, latencyMs: 9000, costUsd: null, error: "OpenRouter 502" }),
  ];
  const r = buildParseReport(rows);

  it("summarises attempts, outcomes and latency", () => {
    expect(r).toMatchObject({ attempts: 3, logged: 1, abandoned: 1, errors: 1, latencyP50: 1500 });
    expect(r.items).toEqual({ drafted: 4, unmatched: 1, kept: 1, regrammed: 1, swapped: 1, removed: 0, added: 0 });
    expect(r.exactRate).toBeCloseTo(1 / 3);
  });

  it("lists what to fix: missing foods, wrong matches, gram corrections", () => {
    expect(r.missing).toEqual([{ said: "guacamole", search: "guacamole", times: 1, examples: ["1tbsp guac"] }]);
    expect(r.wrongMatches).toEqual([{ said: "masala chai", drafted: "Dry masala chops", times: 1 }]);
    expect(r.grams).toEqual([{ said: "dal", food: "Sabut moong dal", drafted: 150, saved: 220 }]);
    expect(r.abandoned_).toEqual(["1tbsp guac"]);
  });

  it("renders markdown with every section", () => {
    const md = reportMarkdown(r, "2026-10-28", "2026-11-03");
    expect(md).toContain("**guacamole**");
    expect(md).toContain("**masala chai** → Dry masala chops ×1");
    expect(md).toContain("150 g → 220 g");
    expect(md).toContain("## Failed");
  });
});
