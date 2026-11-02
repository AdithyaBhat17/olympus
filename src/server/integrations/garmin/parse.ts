/**
 * Garmin Personal API responses → Olympus rows. Pure, no I/O.
 *
 * Shapes are from a real Instinct 2 + Cirqa (docs/companion/garmin-findings.md):
 * - hrv.daily:       { hrvSummaries: [{ calendarDate, lastNightAvg, weeklyAvg, lastNight5MinHigh, status, baseline }] }
 * - sleep.summaries: [{ calendarDate, sleepTimeSeconds, deepSleepSeconds, …, sleepStartTimestampGMT (epoch ms),
 *                       sleepStartTimestampLocal (epoch ms shifted to local), sleepNeed, nextSleepNeed, … }]
 * - summary.v2:      { data: [{ calendarDate, heartRate: { restingValue }, stress, bodyBattery, movement, … }] }
 * - activity list:   [{ activityId, startTimeGMT "yyyy-MM-dd HH:mm:ss", startTimeLocal, duration (s), … }]
 *
 * Every calendarDate is Garmin's local date, i.e. the athlete's day where
 * they were, which is what Olympus means by a date. Sleep is dated by the
 * morning the athlete woke up, as Olympus check-ins are.
 */
import type { ActivityDetails, DailyWearableInsert, SleepDetail, SleepNeed } from "@/lib/db/schema";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length ? v : undefined);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** A whole number in [lo, hi], else undefined. Garmin uses -1/-2 for "no data". */
function within(v: unknown, lo: number, hi: number): number | undefined {
  const n = num(v);
  if (n === undefined || n < lo || n > hi) return undefined;
  return Math.round(n);
}

/** A number in [lo, hi], kept to one decimal. */
function between(v: unknown, lo: number, hi: number): number | undefined {
  const n = num(v);
  return n === undefined || n < lo || n > hi ? undefined : Math.round(n * 10) / 10;
}

const secToMin = (v: unknown) => {
  const n = num(v);
  return n === undefined || n < 0 ? undefined : within(n / 60, 0, 1440);
};

/** Keep only defined values, so a partial row never overwrites a column with null. */
function defined<T extends Obj>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Garmin returns either a bare array or { key: [...] } / { data: [...] }. */
export function itemsOf(doc: unknown, key: string): Obj[] {
  const list = Array.isArray(doc) ? doc : isObj(doc) ? doc[key] : undefined;
  return Array.isArray(list) ? list.filter(isObj) : [];
}

// --- Daily -------------------------------------------------------------------

export type WearableDay = Omit<DailyWearableInsert, "userId" | "updatedAt">;

export function parseHrvDay(item: Obj): WearableDay | null {
  if (!isDate(item.calendarDate)) return null;
  const hrvMs = within(item.lastNightAvg, 1, 500);
  if (hrvMs === undefined) return null;
  return {
    date: item.calendarDate,
    source: "garmin",
    ...defined({
      hrvMs,
      hrvMethod: "rmssd" as const,
      hrvWeeklyAvgMs: within(item.weeklyAvg, 1, 500),
      hrv5minHighMs: within(item.lastNight5MinHigh, 1, 500),
      hrvStatus: str(item.status),
    }),
  };
}

function parseSleepNeed(v: unknown): SleepNeed | undefined {
  if (!isObj(v)) return undefined;
  const need = defined({
    baselineMin: within(v.baseline, 0, 1440),
    actualMin: within(v.actual, 0, 1440),
    feedback: str(v.feedback),
    trainingFeedback: str(v.trainingFeedback),
    sleepHistoryAdjustment: str(v.sleepHistoryAdjustment),
    hrvAdjustment: str(v.hrvAdjustment),
    napAdjustment: str(v.napAdjustment),
    bedtimeStartMin: within(v.recommendedBedtimeStartMins, 0, 1440),
    bedtimeEndMin: within(v.recommendedBedtimeEndMins, 0, 1440),
  }) as SleepNeed;
  return Object.keys(need).length ? need : undefined;
}

export function parseSleepDay(item: Obj): WearableDay | null {
  if (!isDate(item.calendarDate)) return null;
  const sleepMin = secToMin(item.sleepTimeSeconds);
  if (!sleepMin) return null;
  const startGmt = num(item.sleepStartTimestampGMT);
  const endGmt = num(item.sleepEndTimestampGMT);
  const startLocal = num(item.sleepStartTimestampLocal);
  const offset = startGmt !== undefined && startLocal !== undefined ? Math.round((startLocal - startGmt) / 60_000) : undefined;
  const need = parseSleepNeed(item.sleepNeed);
  const next = parseSleepNeed(item.nextSleepNeed);
  return {
    date: item.calendarDate,
    source: "garmin",
    ...defined({
      sleepMin,
      deepMin: secToMin(item.deepSleepSeconds),
      lightMin: secToMin(item.lightSleepSeconds),
      remMin: secToMin(item.remSleepSeconds),
      awakeMin: secToMin(item.awakeSleepSeconds),
      awakenings: within(item.awakeCount, 0, 500),
      napMin: secToMin(item.napTimeSeconds),
      sleepStart: startGmt !== undefined ? new Date(startGmt) : undefined,
      sleepEnd: endGmt !== undefined ? new Date(endGmt) : undefined,
      sleepUtcOffsetMin: offset !== undefined && Math.abs(offset) <= 840 ? offset : undefined,
      sleepHrAvg: within(item.avgHeartRate, 20, 200),
      respirationAvg: between(item.averageRespirationValue, 1, 60),
      spo2Avg: within(item.averageSpO2Value, 50, 100),
      sleepStressAvg: within(item.avgSleepStress, 0, 100),
      sleepNeed: need || next ? { ...(need ?? {}), ...(next ? { next } : {}) } : undefined,
    }),
  };
}

/** Band → Garmin's field. The names aren't regular (rest… vs highStress…). */
const STRESS_BANDS = {
  rest: "restDurationInMillis",
  low: "lowStressDurationInMillis",
  medium: "mediumStressDurationInMillis",
  high: "highStressDurationInMillis",
  activity: "activityDurationInMillis",
  uncategorized: "uncategorizedDurationInMillis",
} as const;

export function parseDailySummary(item: Obj): WearableDay | null {
  if (!isDate(item.calendarDate)) return null;
  const hr = isObj(item.heartRate) ? item.heartRate : {};
  const stress = isObj(item.stress) ? item.stress : {};
  const bb = isObj(item.bodyBattery) ? item.bodyBattery : {};
  const movement = isObj(item.movement) ? item.movement : {};
  const steps = isObj(movement.steps) ? movement.steps : {};
  const intensity = isObj(item.intensityMinutes) ? item.intensityMinutes : {};
  const calories = isObj(item.calories) ? item.calories : {};

  const stressMin = defined(
    Object.fromEntries(
      Object.entries(STRESS_BANDS).map(([band, field]) => [band, secToMin((num(stress[field]) ?? NaN) / 1000)])
    )
  ) as Record<string, number>;
  const battery = defined({
    min: within(bb.minValue, 0, 100),
    max: within(bb.maxValue, 0, 100),
    charged: within(bb.chargedValue, 0, 200),
    drained: within(bb.drainedValue, 0, 200),
    latest: within(bb.latestValue, 0, 100),
  }) as Record<string, number>;
  const jetLag = isObj(item.jetLag) && Object.keys(item.jetLag).length ? item.jetLag : undefined;

  const row = defined({
    restingHr: within(hr.restingValue, 20, 200),
    stressAvg: within(stress.avgLevel, 0, 100),
    stress: Object.keys(stressMin).length ? stressMin : undefined,
    bodyBattery: Object.keys(battery).length ? battery : undefined,
    steps: within(steps.value, 0, 500_000),
    moderateMin: within(intensity.moderate, 0, 1440),
    vigorousMin: within(intensity.vigorous, 0, 1440),
    activeKcal: within(calories.burnedActive, 0, 20_000),
    jetLag,
  });
  // A day the watch wasn't worn still comes back, with zeros. Only keep days
  // that measured something about the athlete.
  const worn = row.restingHr !== undefined || row.stressAvg !== undefined || row.bodyBattery !== undefined || (row.steps ?? 0) > 0;
  if (!worn) return null;
  return { date: item.calendarDate, source: "garmin", ...row };
}

/** Merge per-endpoint pieces of the same day; later pieces fill gaps, never erase. */
export function mergeDays(parts: Array<WearableDay | null>): Map<string, WearableDay> {
  const out = new Map<string, WearableDay>();
  for (const p of parts) {
    if (!p) continue;
    out.set(p.date, { ...(out.get(p.date) ?? {}), ...p });
  }
  return out;
}

/** "HH:mm" from a local-shifted epoch (Garmin's *TimestampLocal). */
function hhmm(localMs: number): string {
  return new Date(localMs).toISOString().slice(11, 16);
}

export interface GarminCheckInPatch {
  sleepMin?: number;
  hrvMs?: number;
  restingHr?: number;
  sleepDetail?: Omit<SleepDetail, "source">;
}

/**
 * What a Garmin day contributes to the merged daily check-in. Missing values
 * are left out, never nulled.
 *
 * Resting HR only counts on nights Garmin also recorded sleep: Garmin's RHR
 * is a whole-day figure, and on a day the watch wasn't worn overnight it
 * comes from a few hours of wear (and would outrank a Whoop or Watch value
 * that saw the whole night). daily_wearable keeps it either way.
 */
export function checkInPatch(day: WearableDay): GarminCheckInPatch {
  const offsetMs = (day.sleepUtcOffsetMin ?? 0) * 60_000;
  const detail =
    day.sleepMin != null
      ? (defined({
          device: "Garmin",
          bedtime: day.sleepStart ? hhmm(day.sleepStart.getTime() + offsetMs) : undefined,
          wakeTime: day.sleepEnd ? hhmm(day.sleepEnd.getTime() + offsetMs) : undefined,
          deepMin: day.deepMin ?? undefined,
          remMin: day.remMin ?? undefined,
          lightMin: day.lightMin ?? undefined,
          awakeMin: day.awakeMin ?? undefined,
          awakenings: day.awakenings ?? undefined,
          respiratoryRate: day.respirationAvg ?? undefined,
        }) as Omit<SleepDetail, "source">)
      : undefined;
  return defined({
    sleepMin: day.sleepMin ?? undefined,
    hrvMs: day.hrvMs ?? undefined,
    restingHr: day.sleepMin != null ? (day.restingHr ?? undefined) : undefined,
    sleepDetail: detail,
  });
}

// --- Activities ------------------------------------------------------------------

export interface GarminActivity {
  externalId: string;
  date: string;
  startedAt: Date;
  endedAt: Date;
  activityType: string;
  device: string;
  durationMin: number;
  distanceM: number | null;
  activeKcal: number | null;
  avgHr: number | null;
  maxHr: number | null;
  details: ActivityDetails;
}

/** "2026-11-02 17:54:47" (no zone) → epoch ms, read as UTC. */
function garminTimeMs(v: unknown): number | undefined {
  const s = str(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(s)) return undefined;
  const ms = Date.parse(`${s.replace(" ", "T").slice(0, 19)}Z`);
  return Number.isFinite(ms) ? ms : undefined;
}

export function parseActivity(item: Obj): GarminActivity | null {
  const id = num(item.activityId);
  const startGmt = garminTimeMs(item.startTimeGMT) ?? num(item.beginTimestamp);
  const startLocal = garminTimeMs(item.startTimeLocal);
  const durationSec = num(item.elapsedDuration) ?? num(item.duration);
  if (id === undefined || startGmt === undefined || !durationSec || durationSec <= 0 || durationSec > 86_400) return null;
  const type = isObj(item.activityType) ? str(item.activityType.typeKey) : undefined;
  const offset = startLocal !== undefined ? Math.round((startLocal - startGmt) / 60_000) : undefined;
  const total = num(item.calories);
  const bmr = num(item.bmrCalories) ?? 0;
  const date = startLocal !== undefined ? new Date(startLocal).toISOString().slice(0, 10) : new Date(startGmt).toISOString().slice(0, 10);
  return {
    externalId: String(id),
    date,
    startedAt: new Date(startGmt),
    endedAt: new Date(startGmt + durationSec * 1000),
    activityType: type ?? "other",
    device: "Garmin",
    durationMin: Math.max(1, Math.round(durationSec / 60)),
    distanceM: within(item.distance, 0, 1_000_000) ?? null,
    activeKcal: total !== undefined ? Math.max(0, Math.round(total - bmr)) : null,
    avgHr: within(item.averageHR, 30, 240) ?? null,
    maxHr: within(item.maxHR, 30, 240) ?? null,
    details: defined({
      name: str(item.activityName)?.trim(),
      aerobicEffect: num(item.aerobicTrainingEffect),
      anaerobicEffect: num(item.anaerobicTrainingEffect),
      trainingLoad: num(item.activityTrainingLoad),
      effectLabel: str(item.trainingEffectLabel),
      utcOffsetMin: offset !== undefined && Math.abs(offset) <= 840 ? offset : undefined,
      totalKcal: total !== undefined ? Math.round(total) : undefined,
    }) as ActivityDetails,
  };
}
