import { describe, expect, it } from "vitest";
import { outsideSessions, preferRicherSource, sameTraining } from "./activity-overlap";

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

describe("preferRicherSource", () => {
  const at = (source: string, startMin: number, endMin: number) => ({
    source,
    startMs: startMin * 60_000,
    endMs: endMin * 60_000,
  });

  it("drops the Apple Health copy of a Garmin activity", () => {
    const g = at("garmin", 0, 60);
    const ah = at("apple_health", 1, 61);
    expect(preferRicherSource([ah, g])).toEqual([g]);
  });

  it("keeps Apple Health workouts Garmin didn't record", () => {
    const g = at("garmin", 0, 60);
    const run = at("apple_health", 120, 150);
    expect(preferRicherSource([g, run])).toEqual([g, run]);
  });

  it("drops the Whoop and Apple Health copies of a Garmin activity", () => {
    const g = at("garmin", 0, 60);
    expect(preferRicherSource([at("apple_health", 1, 61), at("whoop", 0, 59), g])).toEqual([g]);
  });

  it("keeps Whoop over Apple Health when there is no Garmin", () => {
    const w = at("whoop", 0, 60);
    expect(preferRicherSource([at("apple_health", 1, 61), w])).toEqual([w]);
  });

  it("doesn't let a dropped duplicate hide another workout", () => {
    const g = at("garmin", 0, 60);
    const w = at("whoop", 30, 90); // half inside g: same training, dropped
    const a = at("apple_health", 80, 140); // only touches w, which is gone
    expect(preferRicherSource([g, w, a])).toEqual([g, a]);
  });

  it("changes nothing without Garmin", () => {
    const a = [at("apple_health", 0, 30), at("apple_health", 10, 40)];
    expect(preferRicherSource(a)).toEqual(a);
  });
});
