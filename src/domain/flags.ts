import { formatKg, isBarbell, isHarder, topSet } from "./load";
import { isUnderloaded } from "./validation";
import type { DomainExercise, SetFlag, SetLogEntry } from "./types";

/** An opener this much easier than the day's top set, at 3+ more reps, was a warm-up. */
export const OPENER_GAP = 0.1;
export const OPENER_EXTRA_REPS = 3;
/** A top set this easy means the whole exercise was underloaded. */
export const TOO_EASY_RPE = 6.5;

/**
 * Barbell compounds ramp up through lighter sets by design (60/70/80 deadlift),
 * so their openers aren't underloads.
 */
export function rampExempt(
  ex: Pick<DomainExercise, "isCompound" | "name"> & { equipment?: string | null }
): boolean {
  return ex.isCompound && isBarbell(ex);
}

/**
 * Flags for every set of one exercise in one session. Recomputed from the
 * whole set list, so an opener gets flagged once the heavier sets land.
 *
 * - underloaded: > 15% easier than the previous session's top set; or an
 *   opener (before the day's top weight) >= 10% easier AND >= 3 more reps than
 *   the top set (the "first set lands at 15 reps" pattern); or every set when
 *   the highest RPE logged for the exercise was <= 6.5.
 * - top_set_pr: harder than the previous session's top set.
 * - blocked_override and any flag in `keep` already on a set are preserved.
 */
export function annotateSets(
  ex: Pick<DomainExercise, "loadMode" | "isCompound" | "name"> & { equipment?: string | null },
  sets: SetLogEntry[],
  prevTopKg: number | null,
  opts: { blockedOverride?: boolean; keep?: SetFlag[] } = {}
): SetLogEntry[] {
  const keep = new Set<SetFlag>(["blocked_override", ...(opts.keep ?? [])]);
  if (ex.loadMode === "TIME") {
    // Minutes of cardio can't be underloaded or a PR.
    return sets.map((s) => ({
      ...s,
      flags: opts.blockedOverride || s.flags?.includes("blocked_override") ? ["blocked_override"] : [],
    }));
  }
  const top = topSet(ex.loadMode, sets);
  const firstTopIdx = top
    ? sets.findIndex((s) => s.type !== "warmup" && s.weight === top.weight)
    : -1;
  const exempt = rampExempt(ex);
  const rpes = sets
    .filter((s) => s.type !== "warmup")
    .map((s) => s.rpe)
    .filter((r): r is number => r != null);
  const tooEasy = rpes.length > 0 && Math.max(...rpes) <= TOO_EASY_RPE;

  return sets.map((s, i) => {
    const flags = new Set<SetFlag>((s.flags ?? []).filter((f) => keep.has(f)));
    if (opts.blockedOverride) flags.add("blocked_override");
    if (s.type !== "warmup") {
      if (prevTopKg != null) {
        if (isUnderloaded(ex, s.weight, prevTopKg)) flags.add("underloaded");
        if (isHarder(ex.loadMode, s.weight, prevTopKg)) flags.add("top_set_pr");
      }
      if (top && !exempt && i < firstTopIdx && isHarder(ex.loadMode, top.weight, s.weight)) {
        const gap = top.weight > 0 ? Math.abs(top.weight - s.weight) / top.weight : 0;
        if (gap >= OPENER_GAP - 1e-9 && s.reps >= top.reps + OPENER_EXTRA_REPS) {
          flags.add("underloaded");
        }
      }
      if (tooEasy) flags.add("underloaded");
      // An opener left on the table isn't a PR, even if it beats last week.
      if (flags.has("underloaded")) flags.delete("top_set_pr");
    }
    const order: SetFlag[] = ["underloaded", "top_set_pr", "blocked_override"];
    return { ...s, flags: order.filter((f) => flags.has(f)) };
  });
}

/** Flags for a single set at log time. Prefer annotateSets, which sees the whole exercise. */
export function flagsForSet(
  ex: Pick<DomainExercise, "loadMode">,
  set: Pick<SetLogEntry, "weight" | "type">,
  lastTopKg: number | null,
  opts: { blockedOverride?: boolean } = {}
): SetFlag[] {
  const flags: SetFlag[] = [];
  if (set.type !== "warmup" && lastTopKg != null) {
    if (isUnderloaded(ex, set.weight, lastTopKg)) flags.push("underloaded");
    if (isHarder(ex.loadMode, set.weight, lastTopKg)) flags.push("top_set_pr");
  }
  if (opts.blockedOverride) flags.push("blocked_override");
  return flags;
}

export interface SessionCatch {
  kind: "pr" | "underload" | "blocked" | "recovery";
  text: string;
}

/** "What the app caught" on the Finish screen. */
export function sessionCatches(
  items: Array<{
    ex: Pick<DomainExercise, "name" | "loadMode">;
    sets: SetLogEntry[];
    lastTopKg: number | null;
  }>
): SessionCatch[] {
  const out: SessionCatch[] = [];
  for (const { ex, sets } of items) {
    const top = topSet(ex.loadMode, sets);
    if (top?.flags?.includes("top_set_pr") || sets.some((s) => s.flags?.includes("top_set_pr"))) {
      const t = top!;
      out.push({
        kind: "pr",
        text: `${ex.name} top set ${formatKg(t.weight)} × ${t.reps}${t.rpe != null ? ` @ ${t.rpe}` : ""}. New working weight.`,
      });
    }
    sets.forEach((s, i) => {
      if (s.flags?.includes("underloaded")) {
        out.push({
          kind: "underload",
          text: `${ex.name} set ${i + 1} underloaded (${formatKg(s.weight)} × ${s.reps}${s.rpe != null ? ` @ ${s.rpe}` : ""}).`,
        });
      }
    });
    if (sets.some((s) => s.flags?.includes("blocked_override"))) {
      out.push({ kind: "blocked", text: `${ex.name} logged despite a block, flagged for your PT.` });
    }
  }
  return out;
}
