import { describe, expect, it } from "vitest";
import { asleepMinutes, mainSleepByDate, wakeDate, type WhoopSleep } from "./whoop-parse";

const sleep = (over: Partial<WhoopSleep> & { inBed: number; awake: number }): WhoopSleep => ({
  start: "2026-10-01T19:30:00.000Z",
  end: "2026-10-02T02:10:00.000Z",
  timezone_offset: "+04:00",
  nap: false,
  score_state: "SCORED",
  score: {
    stage_summary: {
      total_in_bed_time_milli: over.inBed * 60_000,
      total_awake_time_milli: over.awake * 60_000,
      total_no_data_time_milli: 0,
    },
  },
  ...over,
});

describe("whoop sleep parsing", () => {
  it("dates a night by the local wake-up day", () => {
    // 02:10Z is 06:10 in Abu Dhabi on the 2nd.
    expect(wakeDate({ end: "2026-10-02T02:10:00Z", timezone_offset: "+04:00" })).toBe("2026-10-02");
    // 03:00Z is 22:00 on the 1st in New York.
    expect(wakeDate({ end: "2026-10-02T03:00:00Z", timezone_offset: "-05:00" })).toBe("2026-10-01");
  });
  it("counts time asleep, not time in bed", () => {
    expect(asleepMinutes(sleep({ inBed: 400, awake: 60 }))).toBe(340);
  });
  it("ignores naps and unscored nights, keeps the longest main sleep", () => {
    const m = mainSleepByDate([
      sleep({ inBed: 400, awake: 60 }),
      sleep({ inBed: 90, awake: 5, nap: true }),
      sleep({ inBed: 300, awake: 20, score_state: "PENDING_SCORE" }),
    ]);
    expect(Array.from(m.entries())).toEqual([["2026-10-02", 340]]);
  });
});
