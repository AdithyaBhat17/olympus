import { DEFAULT_TARGETS, type Targets } from "./targets";

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
  /** True only when today's sleep is logged AND under the floor. */
  progressionOnHold: boolean;
  /**
   * clear = slept enough; hold = slept too little; unknown = no sleep logged
   * for today, so nobody knows. Unknown must be asked about, never assumed fine.
   */
  gate: "clear" | "hold" | "unknown";
  /** The sleep floor this was judged against. */
  minSleepMin: number;
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
  targets: Pick<Targets, "minSleepMin" | "proteinG"> = DEFAULT_TARGETS
): RecoverySummary {
  const { minSleepMin, proteinG } = targets;
  let shortSleepStreak = 0;
  for (const c of checkIns) {
    if (c.sleepMin == null || c.sleepMin >= minSleepMin) break;
    shortSleepStreak++;
  }
  const sleeps = checkIns.map((c) => c.sleepMin).filter((v): v is number => v != null);
  const avgSleepMin = sleeps.length
    ? Math.round(sleeps.reduce((a, b) => a + b, 0) / sleeps.length)
    : null;
  const daysUnderProtein =
    proteinG == null
      ? 0
      : checkIns.filter((c) => c.proteinG != null && c.proteinG < proteinG).length;

  const streaks: string[] = [];
  if (shortSleepStreak > 0) {
    streaks.push(
      `${shortSleepStreak} night${shortSleepStreak === 1 ? "" : "s"} under ${formatHours(minSleepMin)} h`
    );
  }
  if (daysUnderProtein > 0) {
    streaks.push(
      `${daysUnderProtein} of ${checkIns.length} days under ${proteinG} g protein`
    );
  }

  const today = checkIns[0];
  return {
    shortSleepStreak,
    avgSleepMin,
    daysUnderProtein,
    streaks,
    progressionOnHold: today?.sleepMin != null && today.sleepMin < minSleepMin,
    gate:
      today?.sleepMin == null
        ? "unknown"
        : today.sleepMin < minSleepMin
          ? "hold"
          : "clear",
    minSleepMin,
  };
}

/** 360 → "6", 390 → "6.5" */
export function formatHours(min: number): string {
  return String(Math.round((min / 60) * 10) / 10);
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
      ? `, ${ordinal(summary.shortSleepStreak)} short night`
      : "";
  return `Sleep under ${formatHours(summary.minSleepMin)} h${nth}. Hit last session's loads; no bumps.`;
}

/** One line for Claude/the app on whether load may go up today. */
export function gateMessage(summary: RecoverySummary): string {
  if (summary.gate === "hold") return holdMessage(summary) ?? "Progression on hold today.";
  if (summary.gate === "unknown") {
    return "No sleep logged for today. Ask how they slept before adding load.";
  }
  return "Slept enough. Progression allowed where earned.";
}
