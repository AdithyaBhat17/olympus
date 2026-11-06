import { describe, expect, it } from "vitest";
import {
  asleepMinutes,
  mainSleepByDate,
  parseWorkout,
  recoveryByDate,
  sleepDetailByDate,
  wakeDate,
  wearableByDate,
  type WhoopRecovery,
  type WhoopSleep,
  type WhoopWorkout,
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
  it("describes the main sleep's stages in its own timezone", () => {
    const night = sleep({ inBed: 400, awake: 60 });
    Object.assign(night.score!, { respiratory_rate: 15.27, sleep_efficiency_percentage: 84.6 });
    Object.assign(night.score!.stage_summary, {
      total_light_sleep_time_milli: 190 * 60_000,
      total_slow_wave_sleep_time_milli: 70 * 60_000,
      total_rem_sleep_time_milli: 80 * 60_000,
      disturbance_count: 9,
    });
    const nap = sleep({ id: "nap", inBed: 90, awake: 5, nap: true });
    expect(Object.fromEntries(sleepDetailByDate([night, nap]))).toEqual({
      "2026-10-02": {
        device: "WHOOP",
        bedtime: "23:30",
        wakeTime: "06:10",
        deepMin: 70,
        remMin: 80,
        lightMin: 190,
        awakeMin: 60,
        awakenings: 9,
        efficiencyPct: 85,
        respiratoryRate: 15.3,
      },
    });
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

describe("whoop workouts", () => {
  const workout = (over: Partial<WhoopWorkout> = {}): WhoopWorkout => ({
    id: "w-1",
    start: "2026-10-01T13:00:00.000Z",
    end: "2026-10-01T14:00:00.000Z",
    timezone_offset: "+04:00",
    sport_name: "Weightlifting",
    score_state: "SCORED",
    score: {
      strain: 10.46,
      average_heart_rate: 118.4,
      max_heart_rate: 161,
      kilojoule: 1046,
      percent_recorded: 90,
      distance_meter: 0,
    },
    ...over,
  });

  it("maps a scored workout to an activity", () => {
    expect(parseWorkout(workout())).toMatchObject({
      externalId: "w-1",
      date: "2026-10-01",
      activityType: "weightlifting",
      durationMin: 60,
      activeKcal: 250,
      avgHr: 118,
      maxHr: 161,
      hrCoveredMin: 54,
      utcOffsetMin: 240,
      strain: 10.5,
    });
  });
  it("dates a workout by its own local day", () => {
    // 21:30Z is 01:30 the next day in Abu Dhabi.
    expect(parseWorkout(workout({ start: "2026-10-01T21:30:00Z", end: "2026-10-01T22:30:00Z" }))?.date).toBe("2026-10-02");
  });
  it("skips unscored and unbelievable workouts", () => {
    expect(parseWorkout(workout({ score_state: "PENDING_SCORE", score: undefined }))).toBeNull();
    expect(parseWorkout(workout({ end: "2026-10-01T13:00:00.000Z" }))).toBeNull();
    expect(parseWorkout(workout({ end: "2026-10-03T13:00:00.000Z" }))).toBeNull();
  });
  it("drops out-of-range heart rates instead of storing them", () => {
    const r = parseWorkout(workout({ score: { average_heart_rate: 5, max_heart_rate: 400 } }));
    expect(r).toMatchObject({ avgHr: null, maxHr: null, hrCoveredMin: null });
  });
  it("names unnamed sports 'other' and kebab-cases spaced ones", () => {
    expect(parseWorkout(workout({ sport_name: undefined }))?.activityType).toBe("other");
    expect(parseWorkout(workout({ sport_name: "Functional Fitness" }))?.activityType).toBe("functional-fitness");
  });
});

describe("whoop daily wearable", () => {
  it("combines the night, naps and recovery under the wake-up date", () => {
    const main = sleep({ inBed: 480, awake: 60 });
    main.score!.stage_summary.total_slow_wave_sleep_time_milli = 90 * 60_000;
    main.score!.respiratory_rate = 15.24;
    const nap = sleep({ id: "nap", nap: true, inBed: 40, awake: 10, start: "2026-10-02T09:00:00Z", end: "2026-10-02T09:40:00Z" });
    const rec: WhoopRecovery = {
      sleep_id: "sleep-1",
      score_state: "SCORED",
      score: { resting_heart_rate: 52, hrv_rmssd_milli: 61.6 },
    };
    const day = wearableByDate([main, nap], [rec]).get("2026-10-02");
    expect(day).toMatchObject({
      sleepMin: 420,
      deepMin: 90,
      napMin: 30,
      hrvMs: 62,
      hrvMethod: "rmssd",
      restingHr: 52,
      respirationAvg: 15.2,
      sleepUtcOffsetMin: 240,
    });
  });
});
