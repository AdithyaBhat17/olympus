import { describe, expect, it } from "vitest";
import { hrBasis, hrLoad, rpeLoad, sessionRpe, trainingLoad, type LoadItem } from "../training-load";

const item = (date: string, over: Partial<LoadItem> = {}): LoadItem => ({
  date,
  kind: "olympus",
  durationMin: 60,
  rpe: 8,
  avgHr: null,
  hrCoveredMin: null,
  ...over,
});

describe("session RPE", () => {
  it("averages working sets and skips warm-ups and unrated sets", () => {
    expect(
      sessionRpe([
        { reps: 10, weight: 40, rpe: 5, type: "warmup" },
        { reps: 5, weight: 100, rpe: 8 },
        { reps: 5, weight: 100, rpe: 9, type: "working" },
        { reps: 5, weight: 100, rpe: null },
      ])
    ).toBe(8.5);
  });
  it("is null with nothing rated", () => {
    expect(sessionRpe([{ reps: 5, weight: 100 }])).toBeNull();
  });
});

describe("loads", () => {
  const basis = { restingHr: 55, maxHr: 185 };

  it("RPE load is RPE × minutes", () => {
    expect(rpeLoad(item("2026-10-31"))).toBe(480);
    expect(rpeLoad(item("2026-10-31", { durationMin: null }))).toBeNull();
  });
  it("HR load rises steeply with intensity", () => {
    const easy = hrLoad(item("2026-10-31", { avgHr: 110, hrCoveredMin: 60 }), basis)!;
    const hard = hrLoad(item("2026-10-31", { avgHr: 160, hrCoveredMin: 60 }), basis)!;
    expect(easy).toBeGreaterThan(0);
    expect(hard).toBeGreaterThan(easy * 2);
  });
  it("skips HR load when a wrist only caught part of the session", () => {
    expect(hrLoad(item("2026-10-31", { avgHr: 140, hrCoveredMin: 12 }), basis)).toBeNull();
  });
  it("needs a few readings and a believable reserve for an HR basis", () => {
    expect(hrBasis([55, 60], [180, 182, 185])).toBeNull();
    expect(hrBasis([58, 55, 60, 54], [170, 185, 178])).toEqual({ restingHr: 57, maxHr: 185 });
    expect(hrBasis([70, 70, 70], [100, 105, 108])).toBeNull();
  });
});

describe("training load windows", () => {
  it("compares the last week with the 4-week weekly average", () => {
    // One 60-min RPE 8 session a week for 3 weeks, then three this week.
    const items = ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27", "2026-10-29", "2026-10-31"].map((d) => item(d));
    const t = trainingLoad(items, "2026-10-31", null, "2026-09-01");
    expect(t.rpeLoad.acute).toBe(1440);
    expect(t.rpeLoad.chronicWeekly).toBe(720);
    expect(t.rpeLoad.ratio).toBe(2);
    expect(t.hrLoad).toBeNull();
  });
  it("gives no ratio to a new athlete", () => {
    const t = trainingLoad([item("2026-10-30")], "2026-10-31", null, "2026-10-28");
    expect(t.rpeLoad.ratio).toBeNull();
  });
  it("counts outside minutes and unrated sessions separately", () => {
    const t = trainingLoad(
      [
        item("2026-10-30", { kind: "outside", rpe: null, durationMin: 45 }),
        item("2026-10-31", { rpe: null }),
        item("2026-10-20"),
      ],
      "2026-10-31",
      null,
      null
    );
    expect(t.minutes7d).toEqual({ olympus: 60, outside: 45 });
    expect(t.unratedSessions7d).toBe(1);
  });
});
