import { formatKg, incrementFor, isHarder, roundKg, topSet } from "./load";
import { isUnderloaded } from "./validation";
import type { DomainExercise, PlanSet, SetLogEntry } from "./types";

export const SESSIONS_TO_PROGRESS = 2;

export interface ExerciseSessionLog {
  date: string;
  sessionType?: string | null;
  sets: SetLogEntry[];
}

export interface ProgressionStatus {
  workingKg: number | null;
  /** Consecutive recent sessions at workingKg that hit the top of the range at target RPE. */
  hits: number;
  needed: number;
  nextKg: number | null;
  increment: number;
  ready: boolean;
  /** "1 of 2" */
  label: string;
  summary: string;
}

function sessionHit(
  sets: SetLogEntry[],
  kg: number,
  repTop: number,
  targetRpe: number
): boolean {
  return sets.some(
    (s) =>
      s.type !== "warmup" &&
      s.weight === kg &&
      s.reps >= repTop &&
      (s.rpe == null || s.rpe <= targetRpe)
  );
}

/**
 * Double progression: hit the top of the rep range at target RPE for two
 * sessions in a row at the same load, then add one increment.
 * `history` is newest first.
 */
export function progressionStatus(
  ex: Pick<DomainExercise, "name" | "loadMode" | "bodyRegion"> & { isCompound?: boolean },
  history: ExerciseSessionLog[],
  opts: { repTop?: number; targetRpe?: number; sleepGateFails?: boolean } = {}
): ProgressionStatus {
  // Without a planned range: lower-body compounds top out at 8, everything else 10.
  const repTop = opts.repTop ?? (ex.isCompound && ex.bodyRegion === "lower" ? 8 : 10);
  const targetRpe = opts.targetRpe ?? 8;
  const increment = incrementFor(ex);
  const latest = history[0] ? topSet(ex.loadMode, history[0].sets) : null;

  if (!latest) {
    return {
      workingKg: null,
      hits: 0,
      needed: SESSIONS_TO_PROGRESS,
      nextKg: null,
      increment,
      ready: false,
      label: `0 of ${SESSIONS_TO_PROGRESS}`,
      summary: `No ${ex.name} history yet — log a calibration session.`,
    };
  }

  const workingKg = latest.weight;
  let hits = 0;
  for (const h of history) {
    const top = topSet(ex.loadMode, h.sets);
    if (!top || top.weight !== workingKg) break;
    if (!sessionHit(h.sets, workingKg, repTop, targetRpe)) break;
    hits++;
    if (hits >= SESSIONS_TO_PROGRESS) break;
  }

  const ready = hits >= SESSIONS_TO_PROGRESS && !opts.sleepGateFails;
  const nextKg = roundKg(
    ex.loadMode === "COUNTERWEIGHT"
      ? Math.max(0, workingKg - increment)
      : workingKg + increment
  );
  const remaining = SESSIONS_TO_PROGRESS - hits;

  let summary: string;
  if (opts.sleepGateFails && hits >= SESSIONS_TO_PROGRESS) {
    summary = `Ready for ${formatKg(nextKg)} kg but held — sleep under the gate today.`;
  } else if (ready) {
    summary = `Top of range at RPE ${targetRpe} in ${hits} of ${SESSIONS_TO_PROGRESS} sessions. Goes to ${formatKg(nextKg)} kg.`;
  } else {
    summary = `Top of range at RPE ${targetRpe} in ${hits} of ${SESSIONS_TO_PROGRESS} sessions. ${remaining === 1 ? "One more clean session" : `${remaining} more clean sessions`} at ${formatKg(workingKg)} × ${repTop} and it goes to ${formatKg(nextKg)}.`;
  }

  return {
    workingKg,
    hits,
    needed: SESSIONS_TO_PROGRESS,
    nextKg,
    increment,
    ready,
    label: `${hits} of ${SESSIONS_TO_PROGRESS}`,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Live-session underload nudge (same threshold logic as V3)
// ---------------------------------------------------------------------------

export interface UnderloadNudge {
  suggestKg: number;
  headline: string;
  detail: string;
}

/**
 * After a set is logged: if it was clearly a warm-up (reps blew past the
 * range, or RPE ≤ 6.5) and the load was under the planned open, suggest
 * jumping to the open weight for the next set.
 */
export function underloadNudge(
  ex: Pick<DomainExercise, "loadMode">,
  logged: Pick<SetLogEntry, "weight" | "reps" | "rpe">,
  planned: PlanSet | null,
  lastTopKg: number | null
): UnderloadNudge | null {
  const target = planned?.openKg ?? lastTopKg;
  if (target == null) return null;
  const easierThanTarget = isHarder(ex.loadMode, target, logged.weight);
  if (!easierThanTarget) return null;

  const repTop = planned?.reps[1] ?? 10;
  const tooManyReps = logged.reps >= repTop + 3;
  const tooEasy = logged.rpe != null && logged.rpe <= 6.5;
  const pctOff = lastTopKg != null && isUnderloaded(ex, logged.weight, lastTopKg);
  if (!tooManyReps && !tooEasy && !pctOff) return null;

  const gap = Math.abs(roundKg(target - logged.weight));
  const headline =
    logged.rpe != null
      ? `${logged.reps} reps at RPE ${logged.rpe} is a warm-up.`
      : `${logged.reps} reps is a warm-up.`;
  return {
    suggestKg: target,
    headline,
    detail: `You opened ${formatKg(gap)} kg ${ex.loadMode === "COUNTERWEIGHT" ? "over" : "under"} target.`,
  };
}
