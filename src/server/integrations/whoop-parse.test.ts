import { describe, expect, it } from "vitest";
import {
  asleepMinutes,
  mainSleepByDate,
  recoveryByDate,
  wakeDate,
  type WhoopRecovery,
  type WhoopSleep,
} from "./whoop-parse";

const sleep = (over: Partial<WhoopSleep> & { inBed: number; awake: number }): WhoopSleep => ({
  id: "sleep-1",
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

const recovery = (sleepId: string, hrv: number, rhr: number, over: Partial<WhoopRecovery> = {}): WhoopRecovery => ({
  sleep_id: sleepId,
  score_state: "SCORED",
  score: { hrv_rmssd_milli: hrv, resting_heart_rate: rhr },
  ...over,
});

describe("whoop recovery parsing", () => {
  it("dates HRV and resting HR by the wake-up day of their sleep, rounded", () => {
    const m = recoveryByDate([recovery("sleep-1", 61.6, 52.2)], [sleep({ inBed: 400, awake: 60 })]);
    expect(Array.from(m.entries())).toEqual([["2026-10-02", { hrvMs: 62, restingHr: 52 }]]);
  });
  it("skips unscored recoveries and ones whose sleep wasn't fetched", () => {
    const m = recoveryByDate(
      [recovery("sleep-1", 60, 50, { score_state: "PENDING_SCORE", score: undefined }), recovery("gone", 70, 48)],
      [sleep({ inBed: 400, awake: 60 })]
    );
    expect(m.size).toBe(0);
  });
  it("keeps the recovery from the longest sleep on a date", () => {
    const m = recoveryByDate(
      [recovery("short", 40, 60), recovery("long", 65, 50)],
      [sleep({ id: "short", inBed: 120, awake: 10 }), sleep({ id: "long", inBed: 420, awake: 30 })]
    );
    expect(m.get("2026-10-02")).toEqual({ hrvMs: 65, restingHr: 50 });
  });
});
