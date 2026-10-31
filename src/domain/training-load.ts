import type { SetLogEntry } from "./types";

/**
 * Training load over the last 7 and 28 days, for Claude to see how much work
 * has piled up. Two scales, never added together:
 *
 * - RPE load: the athlete's own RPE × minutes, for Olympus sessions. Their
 *   RPE is the effort signal we trust; it's the mean of working-set RPEs,
 *   used as the session's rating (Foster's session-RPE, from set RPEs).
 * - HR load: Banister TRIMP, minutes × heart-rate reserve weighted
 *   exponentially, for anything with heart rate (sessions and outside
 *   activities alike), so a run and a lift land on one scale.
 */

export interface LoadItem {
  /** yyyy-MM-dd, the athlete's local date. */
  date: string;
  kind: "olympus" | "outside";
  durationMin: number | null;
  /** Mean working-set RPE, Olympus sessions only. */
  rpe: number | null;
  avgHr: number | null;
  hrCoveredMin: number | null;
}

export interface HrBasis {
  restingHr: number;
  maxHr: number;
}

/** Mean RPE of the working sets that have one; warm-ups don't count. */
export function sessionRpe(sets: SetLogEntry[]): number | null {
  const rpes = sets.filter((s) => s.type !== "warmup" && s.rpe != null).map((s) => Number(s.rpe));
  if (!rpes.length) return null;
  return Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10;
}

export function rpeLoad(i: LoadItem): number | null {
  return i.rpe != null && i.durationMin ? Math.round(i.rpe * i.durationMin) : null;
}

/** HR covering less than this share of the time isn't the whole session. */
const MIN_HR_COVERAGE = 0.5;

/** Banister TRIMP. Null without a usable HR basis or with thin HR coverage. */
export function hrLoad(i: LoadItem, basis: HrBasis | null): number | null {
  if (!basis || i.avgHr == null || !i.durationMin) return null;
  if ((i.hrCoveredMin ?? 0) < i.durationMin * MIN_HR_COVERAGE) return null;
  const reserve = basis.maxHr - basis.restingHr;
  if (reserve <= 0) return null;
  const x = Math.min(1, Math.max(0, (i.avgHr - basis.restingHr) / reserve));
  return Math.round(i.durationMin * x * 0.64 * Math.exp(1.92 * x));
}

/**
 * Resting HR is the median of recent check-ins; max HR is the highest seen in
 * any stored session or activity, which can sit below a lab max. Needs a few
 * of each before it's worth trusting.
 */
export function hrBasis(restingHrs: number[], maxHrs: number[]): HrBasis | null {
  if (restingHrs.length < 3 || maxHrs.length < 3) return null;
  const sorted = [...restingHrs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const restingHr = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  const maxHr = Math.max(...maxHrs);
  return maxHr - restingHr >= 40 ? { restingHr, maxHr } : null;
}

export interface LoadWindow {
  /** Sum over the last 7 days. */
  acute: number;
  /** Weekly average over the last 28 days. */
  chronicWeekly: number;
  /** acute / chronicWeekly. Null until there are 3+ weeks of history to compare with. */
  ratio: number | null;
}

export interface TrainingLoad {
  date: string;
  rpeLoad: LoadWindow;
  /** Null when there's no HR basis yet. */
  hrLoad: LoadWindow | null;
  hrBasis: HrBasis | null;
  /** Minutes over the last 7 days, by where the training was logged. */
  minutes7d: { olympus: number; outside: number };
  /** Sessions in the last 7 days without RPE or times, so missing from rpeLoad. */
  unratedSessions7d: number;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function window(items: Array<{ date: string; load: number | null }>, date: string, firstDate: string | null): LoadWindow {
  const acuteFrom = addDays(date, -6);
  const chronicFrom = addDays(date, -27);
  const sum = (from: string) =>
    items.filter((i) => i.load != null && i.date >= from && i.date <= date).reduce((a, i) => a + i.load!, 0);
  const acute = sum(acuteFrom);
  const chronicWeekly = Math.round(sum(chronicFrom) / 4);
  const enoughHistory = firstDate != null && firstDate <= addDays(date, -20);
  return {
    acute,
    chronicWeekly,
    ratio: enoughHistory && chronicWeekly > 0 ? Math.round((acute / chronicWeekly) * 100) / 100 : null,
  };
}

/**
 * `items` covers at least the 28 days ending `date`; `firstDate` is the
 * athlete's earliest training on record, so a new athlete's empty first weeks
 * don't read as a spike.
 */
export function trainingLoad(items: LoadItem[], date: string, basis: HrBasis | null, firstDate: string | null): TrainingLoad {
  const acuteFrom = addDays(date, -6);
  const recent = items.filter((i) => i.date >= acuteFrom && i.date <= date);
  const minutes = (kind: LoadItem["kind"]) =>
    recent.filter((i) => i.kind === kind).reduce((a, i) => a + (i.durationMin ?? 0), 0);
  return {
    date,
    rpeLoad: window(items.map((i) => ({ date: i.date, load: rpeLoad(i) })), date, firstDate),
    hrLoad: basis ? window(items.map((i) => ({ date: i.date, load: hrLoad(i, basis) })), date, firstDate) : null,
    hrBasis: basis,
    minutes7d: { olympus: minutes("olympus"), outside: minutes("outside") },
    unratedSessions7d: recent.filter((i) => i.kind === "olympus" && rpeLoad(i) == null).length,
  };
}
