import { TARGETS } from "./targets";

export interface CheckIn {
  date: string;
  sleepMin: number | null;
  proteinG: number | null;
  waterMl: number | null;
}

export interface RecoverySummary {
  /** Consecutive nights under the sleep floor, ending at the latest day. */
  shortSleepStreak: number;
  avgSleepMin: number | null;
  daysUnderProtein: number;
  streaks: string[];
  progressionOnHold: boolean;
}

export function formatSleep(min: number | null | undefined): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${String(m).padStart(2, "0")}`;
}

/** `checkIns` newest first. */
export function summarizeRecovery(
  checkIns: CheckIn[],
  minSleepMin: number = TARGETS.minSleepMin
): RecoverySummary {
  let shortSleepStreak = 0;
  for (const c of checkIns) {
    if (c.sleepMin == null || c.sleepMin >= minSleepMin) break;
    shortSleepStreak++;
  }
  const sleeps = checkIns.map((c) => c.sleepMin).filter((v): v is number => v != null);
  const avgSleepMin = sleeps.length
    ? Math.round(sleeps.reduce((a, b) => a + b, 0) / sleeps.length)
    : null;
  const daysUnderProtein = checkIns.filter(
    (c) => c.proteinG != null && c.proteinG < TARGETS.proteinG
  ).length;

  const streaks: string[] = [];
  if (shortSleepStreak > 0) {
    streaks.push(
      `${shortSleepStreak} night${shortSleepStreak === 1 ? "" : "s"} under ${minSleepMin / 60} h`
    );
  }
  if (daysUnderProtein > 0) {
    streaks.push(
      `${daysUnderProtein} of ${checkIns.length} days under ${TARGETS.proteinG} g protein`
    );
  }

  const today = checkIns[0];
  return {
    shortSleepStreak,
    avgSleepMin,
    daysUnderProtein,
    streaks,
    progressionOnHold: today?.sleepMin != null && today.sleepMin < minSleepMin,
  };
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** "Sleep under 6 h — 5th short night. Hit last session's loads; no bumps." */
export function holdMessage(summary: RecoverySummary): string | null {
  if (!summary.progressionOnHold) return null;
  const nth =
    summary.shortSleepStreak > 1
      ? ` — ${ordinal(summary.shortSleepStreak)} short night`
      : "";
  return `Sleep under ${TARGETS.minSleepMin / 60} h${nth}. Hit last session's loads; no bumps.`;
}
