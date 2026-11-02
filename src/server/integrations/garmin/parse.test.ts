import { describe, expect, it } from "vitest";
import {
  checkInPatch,
  itemsOf,
  mergeDays,
  parseActivity,
  parseDailySummary,
  parseHrvDay,
  parseSleepDay,
} from "./parse";

// Synthetic, but the shapes are the real Instinct 2 + Cirqa responses.
const hrvItem = {
  calendarDate: "2026-11-02",
  weeklyAvg: 60,
  lastNightAvg: 70,
  lastNight5MinHigh: 90,
  baseline: null,
  status: "NONE",
  feedbackPhrase: "ONBOARDING_1",
};

// Dubai (UTC+4): asleep 23:10 local, awake 06:40 local.
const startGmt = Date.parse("2026-11-01T19:10:00Z");
const endGmt = Date.parse("2026-11-02T02:40:00Z");
const sleepItem = {
  calendarDate: "2026-11-02",
  sleepStartTimestampGMT: startGmt,
  sleepEndTimestampGMT: endGmt,
  sleepStartTimestampLocal: startGmt + 4 * 3600_000,
  sleepEndTimestampLocal: endGmt + 4 * 3600_000,
  sleepTimeSeconds: 24_600,
  deepSleepSeconds: 6000,
  lightSleepSeconds: 12_000,
  remSleepSeconds: 6600,
  awakeSleepSeconds: 600,
  unmeasurableSleepSeconds: 0,
  awakeCount: 1,
  averageRespirationValue: 14.6,
  averageSpO2Value: null,
  avgSleepStress: 12,
  avgHeartRate: 52,
  napTimeSeconds: 0,
  sleepNeed: { baseline: 480, actual: 480, feedback: "NO_CHANGE", recommendedBedtimeStartMins: 1360, recommendedBedtimeEndMins: 1380 },
  nextSleepNeed: { baseline: 480, actual: 420, feedback: "DECREASED" },
};

const summaryItem = {
  calendarDate: "2026-11-02",
  source: "garmin",
  heartRate: { minValue: 40, maxValue: 150, restingValue: 48 },
  stress: { avgLevel: 30, restDurationInMillis: 3_600_000, highStressDurationInMillis: 600_000 },
  bodyBattery: { minValue: 10, maxValue: 85, chargedValue: 70, drainedValue: 75, latestValue: 20 },
  movement: { steps: { goal: 5000, value: 8000 } },
  intensityMinutes: { goal: 150, moderate: 30, vigorous: 5 },
  calories: { burnedResting: 1800, burnedActive: 500 },
  jetLag: {},
  pulseOx: {},
};

describe("parseHrvDay", () => {
  it("takes last night's average as RMSSD", () => {
    expect(parseHrvDay(hrvItem)).toEqual({
      date: "2026-11-02",
      source: "garmin",
      hrvMs: 70,
      hrvMethod: "rmssd",
      hrvWeeklyAvgMs: 60,
      hrv5minHighMs: 90,
      hrvStatus: "NONE",
    });
  });

  it("skips nights without a reading", () => {
    expect(parseHrvDay({ ...hrvItem, lastNightAvg: null })).toBeNull();
    expect(parseHrvDay({ ...hrvItem, lastNightAvg: 0 })).toBeNull();
    expect(parseHrvDay({ ...hrvItem, calendarDate: "nope" })).toBeNull();
  });
});

describe("parseSleepDay", () => {
  it("maps minutes, timings, the night's offset and sleep need", () => {
    const d = parseSleepDay(sleepItem)!;
    expect(d).toMatchObject({
      date: "2026-11-02",
      sleepMin: 410,
      deepMin: 100,
      lightMin: 200,
      remMin: 110,
      awakeMin: 10,
      awakenings: 1,
      napMin: 0,
      sleepUtcOffsetMin: 240,
      sleepHrAvg: 52,
      respirationAvg: 14.6,
      sleepStressAvg: 12,
    });
    expect(d.sleepStart).toEqual(new Date(startGmt));
    expect(d.sleepEnd).toEqual(new Date(endGmt));
    expect(d.spo2Avg).toBeUndefined();
    expect(d.sleepNeed).toEqual({
      baselineMin: 480,
      actualMin: 480,
      feedback: "NO_CHANGE",
      bedtimeStartMin: 1360,
      bedtimeEndMin: 1380,
      next: { baselineMin: 480, actualMin: 420, feedback: "DECREASED" },
    });
  });

  it("skips a night with no sleep", () => {
    expect(parseSleepDay({ calendarDate: "2026-10-20", sleepTimeSeconds: null })).toBeNull();
    expect(parseSleepDay({ calendarDate: "2026-10-20", sleepTimeSeconds: 0 })).toBeNull();
  });
});

describe("parseDailySummary", () => {
  it("maps RHR, stress, Body Battery, movement", () => {
    expect(parseDailySummary(summaryItem)).toEqual({
      date: "2026-11-02",
      source: "garmin",
      restingHr: 48,
      stressAvg: 30,
      stress: { rest: 60, high: 10 },
      bodyBattery: { min: 10, max: 85, charged: 70, drained: 75, latest: 20 },
      steps: 8000,
      moderateMin: 30,
      vigorousMin: 5,
      activeKcal: 500,
    });
  });

  it("ignores Garmin's negative no-data markers", () => {
    const d = parseDailySummary({ calendarDate: "2026-10-20", stress: { avgLevel: -1 }, heartRate: { restingValue: null } });
    expect(d).toBeNull();
    expect(parseDailySummary({ calendarDate: "2026-10-20", calories: { burnedActive: 0 }, movement: { steps: { value: 0 } } })).toBeNull();
  });
});

describe("mergeDays + checkInPatch", () => {
  it("joins the three endpoints into one day and builds the check-in", () => {
    const days = mergeDays([parseHrvDay(hrvItem), parseSleepDay(sleepItem), parseDailySummary(summaryItem)]);
    expect(days.size).toBe(1);
    const day = days.get("2026-11-02")!;
    expect(day.hrvMs).toBe(70);
    expect(day.sleepMin).toBe(410);
    expect(day.restingHr).toBe(48);
    expect(checkInPatch(day)).toEqual({
      sleepMin: 410,
      hrvMs: 70,
      restingHr: 48,
      sleepDetail: {
        device: "Garmin",
        bedtime: "23:10",
        wakeTime: "06:40",
        deepMin: 100,
        remMin: 110,
        lightMin: 200,
        awakeMin: 10,
        awakenings: 1,
        respiratoryRate: 14.6,
      },
    });
  });

  it("a day without Garmin sleep sends nothing: its RHR is from partial wear", () => {
    const day = mergeDays([parseDailySummary(summaryItem)]).get("2026-11-02")!;
    expect(day.restingHr).toBe(48);
    expect(checkInPatch(day)).toEqual({});
  });
});

describe("itemsOf", () => {
  it("handles bare arrays and wrapped lists", () => {
    expect(itemsOf([{ a: 1 }, null, 3], "")).toEqual([{ a: 1 }]);
    expect(itemsOf({ data: [{ a: 1 }] }, "data")).toEqual([{ a: 1 }]);
    expect(itemsOf({ nope: 1 }, "data")).toEqual([]);
    expect(itemsOf(null, "data")).toEqual([]);
  });
});

describe("parseActivity", () => {
  const item = {
    activityId: 123,
    activityName: " Inclined walk - treadmill ",
    startTimeLocal: "2026-11-02 21:54:47",
    startTimeGMT: "2026-11-02 17:54:47",
    duration: 660.7,
    elapsedDuration: 660.7,
    distance: 281,
    calories: 99,
    bmrCalories: 17,
    averageHR: 125,
    maxHR: 140,
    aerobicTrainingEffect: 3.1,
    anaerobicTrainingEffect: 0,
    activityTrainingLoad: 40.5,
    trainingEffectLabel: "AEROBIC_BASE",
    activityType: { typeId: 9, typeKey: "walking" },
  };

  it("maps times, local date, active kcal and Garmin extras", () => {
    const a = parseActivity(item)!;
    expect(a).toMatchObject({
      externalId: "123",
      date: "2026-11-02",
      activityType: "walking",
      device: "Garmin",
      durationMin: 11,
      distanceM: 281,
      activeKcal: 82,
      avgHr: 125,
      maxHr: 140,
    });
    expect(a.startedAt.toISOString()).toBe("2026-11-02T17:54:47.000Z");
    expect(a.endedAt.getTime() - a.startedAt.getTime()).toBe(660_700);
    expect(a.details).toEqual({
      name: "Inclined walk - treadmill",
      aerobicEffect: 3.1,
      anaerobicEffect: 0,
      trainingLoad: 40.5,
      effectLabel: "AEROBIC_BASE",
      utcOffsetMin: 240,
      totalKcal: 99,
    });
  });

  it("dates a late-night session by where it was recorded", () => {
    // 23:30 in Bengaluru is still the same local day although UTC is 18:00.
    const a = parseActivity({ ...item, startTimeLocal: "2026-11-02 23:30:00", startTimeGMT: "2026-11-02 18:00:00" })!;
    expect(a.date).toBe("2026-11-02");
    expect(a.details.utcOffsetMin).toBe(330);
  });

  it("rejects activities without an id, start or a believable duration", () => {
    expect(parseActivity({ ...item, activityId: undefined })).toBeNull();
    expect(parseActivity({ ...item, startTimeGMT: undefined, beginTimestamp: undefined })).toBeNull();
    expect(parseActivity({ ...item, duration: 0, elapsedDuration: 0 })).toBeNull();
    expect(parseActivity({ ...item, elapsedDuration: 90_000 })).toBeNull();
  });
});
