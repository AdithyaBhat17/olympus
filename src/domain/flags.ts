import { formatKg, isHarder, topSet } from "./load";
import { isUnderloaded } from "./validation";
import type { DomainExercise, SetFlag, SetLogEntry } from "./types";

/** Flags for a single set at log time. */
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
        text: `${ex.name} top set ${formatKg(t.weight)} × ${t.reps}${t.rpe != null ? ` @ ${t.rpe}` : ""} — new working weight.`,
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
      out.push({ kind: "blocked", text: `${ex.name} logged despite a block — flagged for your PT.` });
    }
  }
  return out;
}
