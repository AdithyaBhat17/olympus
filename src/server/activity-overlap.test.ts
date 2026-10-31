import { describe, expect, it } from "vitest";
import { outsideSessions, sameTraining } from "./activity-overlap";

const at = (hhmm: string) => Date.parse(`2026-10-31T${hhmm}:00Z`);
const span = (from: string, to: string) => ({ startMs: at(from), endMs: at(to) });

describe("activities vs Olympus sessions", () => {
  const lift = span("06:00", "07:10");

  it("treats a device workout started with the session as the same training", () => {
    expect(sameTraining(span("05:55", "07:12"), lift)).toBe(true);
  });
  it("keeps a run straight after lifting as its own activity", () => {
    expect(sameTraining(span("07:05", "07:45"), lift)).toBe(false);
  });
  it("counts a short workout inside the session as the session", () => {
    expect(sameTraining(span("06:30", "06:50"), lift)).toBe(true);
  });
  it("ignores zero-length spans", () => {
    expect(sameTraining(span("06:30", "06:30"), lift)).toBe(false);
  });
  it("filters only the overlapping ones", () => {
    const run = { id: "run", ...span("17:00", "17:50") };
    const strength = { id: "strength", ...span("06:01", "07:09") };
    expect(outsideSessions([run, strength], [lift]).map((a) => a.id)).toEqual(["run"]);
  });
});
