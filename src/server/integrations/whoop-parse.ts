/** Pure parsing of WHOOP v2 sleep records (no I/O — unit tested). */

import type { SleepDetail } from "@/lib/db/schema";

export interface WhoopSleep {
  id: string;
  start: string;
  end: string;
  timezone_offset: string; // "-05:00"
  nap: boolean;
  score_state: "SCORED" | "PENDING_SCORE" | "UNSCORABLE";
  score?: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_no_data_time_milli: number;
      total_light_sleep_time_milli?: number;
      total_slow_wave_sleep_time_milli?: number;
      total_rem_sleep_time_milli?: number;
      disturbance_count?: number;
    };
    respiratory_rate?: number;
    sleep_efficiency_percentage?: number;
  };
}

/** `iso` shifted into the sleep's own timezone, as an ISO string. */
function local(iso: string, offset: string | undefined): string {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset ?? "+00:00");
  const offsetMin = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(new Date(iso).getTime() + offsetMin * 60_000).toISOString();
}

/** The wake-up date in the sleep's own timezone: last night's sleep belongs to today. */
export function wakeDate(s: Pick<WhoopSleep, "end" | "timezone_offset">): string {
  return local(s.end, s.timezone_offset).slice(0, 10);
}

/** Minutes actually asleep: in bed minus awake minus no-data. */
export function asleepMinutes(s: WhoopSleep): number | null {
  const st = s.score?.stage_summary;
  if (s.score_state !== "SCORED" || !st) return null;
  const ms = st.total_in_bed_time_milli - st.total_awake_time_milli - st.total_no_data_time_milli;
  return Math.max(0, Math.round(ms / 60_000));
}

/** The main sleep record per wake-up date: the longest scored non-nap. */
function mainSleepRecords(records: WhoopSleep[]): Map<string, { record: WhoopSleep; min: number }> {
  const byDate = new Map<string, { record: WhoopSleep; min: number }>();
  for (const r of records) {
    if (r.nap) continue;
    const min = asleepMinutes(r);
    if (min == null) continue;
    const d = wakeDate(r);
    if ((byDate.get(d)?.min ?? -1) < min) byDate.set(d, { record: r, min });
  }
  return byDate;
}

/** Main sleep minutes per wake-up date. */
export function mainSleepByDate(records: WhoopSleep[]): Map<string, number> {
  return new Map(Array.from(mainSleepRecords(records), ([d, v]) => [d, v.min]));
}

const toMin = (ms: number | undefined) => (ms == null ? undefined : Math.round(ms / 60_000));

/** How each main sleep went: stages, disturbances, efficiency, bed and wake times. */
export function sleepDetailByDate(records: WhoopSleep[]): Map<string, Omit<SleepDetail, "source">> {
  const out = new Map<string, Omit<SleepDetail, "source">>();
  for (const [d, { record: r }] of Array.from(mainSleepRecords(records))) {
    const st = r.score!.stage_summary;
    out.set(d, {
      device: "WHOOP",
      bedtime: local(r.start, r.timezone_offset).slice(11, 16),
      wakeTime: local(r.end, r.timezone_offset).slice(11, 16),
      deepMin: toMin(st.total_slow_wave_sleep_time_milli),
      remMin: toMin(st.total_rem_sleep_time_milli),
      lightMin: toMin(st.total_light_sleep_time_milli),
      awakeMin: toMin(st.total_awake_time_milli),
      awakenings: st.disturbance_count,
      efficiencyPct: r.score!.sleep_efficiency_percentage == null ? undefined : Math.round(r.score!.sleep_efficiency_percentage),
      respiratoryRate: r.score!.respiratory_rate == null ? undefined : Math.round(r.score!.respiratory_rate * 10) / 10,
    });
  }
  return out;
}

export interface WhoopRecovery {
  sleep_id: string;
  score_state: "SCORED" | "PENDING_SCORE" | "UNSCORABLE";
  score?: {
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
  };
}

export interface WhoopVitals {
  hrvMs: number;
  restingHr: number;
}

/**
 * HRV (RMSSD) and resting HR per wake-up date. A recovery is scored from one
 * sleep, so it takes that sleep's date; one whose sleep isn't in `sleeps` is
 * skipped. Naps don't produce recoveries, but if several land on a date the
 * one from the longest sleep wins, matching mainSleepByDate.
 */
export function recoveryByDate(recoveries: WhoopRecovery[], sleeps: WhoopSleep[]): Map<string, WhoopVitals> {
  const sleepById = new Map(sleeps.map((s) => [s.id, s]));
  const best = new Map<string, { vitals: WhoopVitals; asleep: number }>();
  for (const r of recoveries) {
    if (r.score_state !== "SCORED" || !r.score) continue;
    const s = sleepById.get(r.sleep_id);
    if (!s) continue;
    const date = wakeDate(s);
    const asleep = asleepMinutes(s) ?? 0;
    const prev = best.get(date);
    if (prev && prev.asleep >= asleep) continue;
    best.set(date, {
      asleep,
      vitals: { hrvMs: Math.round(r.score.hrv_rmssd_milli), restingHr: Math.round(r.score.resting_heart_rate) },
    });
  }
  return new Map(Array.from(best, ([d, v]) => [d, v.vitals]));
}

// --- Workouts ----------------------------------------------------------------------

export interface WhoopWorkout {
  id: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_name?: string;
  score_state: "SCORED" | "PENDING_SCORE" | "UNSCORABLE";
  score?: {
    strain?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
    kilojoule?: number;
    percent_recorded?: number;
    distance_meter?: number;
  };
}

export interface ParsedWorkout {
  externalId: string;
  date: string;
  startedAt: Date;
  endedAt: Date;
  activityType: string;
  durationMin: number;
  distanceM: number | null;
  activeKcal: number | null;
  avgHr: number | null;
  maxHr: number | null;
  hrCoveredMin: number | null;
  utcOffsetMin: number | undefined;
  strain: number | undefined;
}

const KJ_PER_KCAL = 4.184;

function offsetMinutes(offset: string | undefined): number | undefined {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset ?? "");
  if (!m) return undefined;
  const v = (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  return Math.abs(v) <= 840 ? v : undefined;
}

const inRange = (v: number | undefined, lo: number, hi: number) =>
  v != null && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : null;

/**
 * A scored workout as an external activity. Unscored ones, and anything with a
 * non-positive or over-a-day duration, are skipped. Whoop's kilojoules are the
 * energy burned over the workout, so they become kcal as-is (no BMR split like
 * Garmin's). HR is covered for `percent_recorded` of the duration.
 */
export function parseWorkout(w: WhoopWorkout): ParsedWorkout | null {
  if (w.score_state !== "SCORED" || !w.score) return null;
  const startMs = Date.parse(w.start);
  const endMs = Date.parse(w.end);
  const durationMs = endMs - startMs;
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 86_400_000) return null;
  const durationMin = Math.max(1, Math.round(durationMs / 60_000));
  const s = w.score;
  const avgHr = inRange(s.average_heart_rate, 30, 240);
  const covered =
    avgHr != null && s.percent_recorded != null
      ? Math.max(1, Math.min(durationMin, Math.round((durationMin * s.percent_recorded) / 100)))
      : null;
  return {
    externalId: w.id,
    date: local(w.start, w.timezone_offset).slice(0, 10),
    startedAt: new Date(startMs),
    endedAt: new Date(endMs),
    activityType: (w.sport_name ?? "other").trim().toLowerCase().replace(/\s+/g, "-") || "other",
    durationMin,
    distanceM: inRange(s.distance_meter, 0, 1_000_000),
    activeKcal: s.kilojoule != null ? inRange(s.kilojoule / KJ_PER_KCAL, 0, 20_000) : null,
    avgHr,
    maxHr: inRange(s.max_heart_rate, 30, 240),
    hrCoveredMin: covered,
    utcOffsetMin: offsetMinutes(w.timezone_offset),
    strain: s.strain == null ? undefined : Math.round(s.strain * 10) / 10,
  };
}

// --- Daily wearable row -------------------------------------------------------------

export interface WhoopWearableDay {
  hrvMs?: number;
  hrvMethod?: "rmssd";
  restingHr?: number;
  sleepMin?: number;
  deepMin?: number;
  lightMin?: number;
  remMin?: number;
  awakeMin?: number;
  awakenings?: number;
  napMin?: number;
  sleepStart?: Date;
  sleepEnd?: Date;
  sleepUtcOffsetMin?: number;
  respirationAvg?: number;
}

/**
 * Everything Whoop reports for a wake-up date, in daily_wearable's columns.
 * Garmin-only fields (stress, Body Battery, steps, sleep need) have no Whoop
 * equivalent and stay null.
 */
export function wearableByDate(sleeps: WhoopSleep[], recoveries: WhoopRecovery[]): Map<string, WhoopWearableDay> {
  const out = new Map<string, WhoopWearableDay>();
  const day = (d: string) => out.get(d) ?? out.set(d, {}).get(d)!;

  for (const [d, { record: r, min }] of Array.from(mainSleepRecords(sleeps))) {
    const st = r.score!.stage_summary;
    Object.assign(day(d), {
      sleepMin: min,
      deepMin: toMin(st.total_slow_wave_sleep_time_milli),
      lightMin: toMin(st.total_light_sleep_time_milli),
      remMin: toMin(st.total_rem_sleep_time_milli),
      awakeMin: toMin(st.total_awake_time_milli),
      awakenings: st.disturbance_count,
      sleepStart: new Date(r.start),
      sleepEnd: new Date(r.end),
      sleepUtcOffsetMin: offsetMinutes(r.timezone_offset),
      respirationAvg: r.score!.respiratory_rate == null ? undefined : Math.round(r.score!.respiratory_rate * 10) / 10,
    });
  }

  const naps = new Map<string, number>();
  for (const r of sleeps) {
    const min = r.nap ? asleepMinutes(r) : null;
    if (min) naps.set(wakeDate(r), (naps.get(wakeDate(r)) ?? 0) + min);
  }
  for (const [d, min] of Array.from(naps)) day(d).napMin = min;

  for (const [d, v] of Array.from(recoveryByDate(recoveries, sleeps))) {
    Object.assign(day(d), { hrvMs: v.hrvMs, hrvMethod: "rmssd" as const, restingHr: v.restingHr });
  }
  return out;
}
