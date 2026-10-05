import { formatKg, formatLoad, topSet } from "@/domain/load";
import type { LoadMode, PlanSet, SetLogEntry } from "@/domain/types";
import type { LiveItemView } from "@/server/sessions";

/** "8–10" or "10". */
export function repRange(reps: [number, number]): string {
  return reps[0] === reps[1] ? String(reps[0]) : `${reps[0]}–${reps[1]}`;
}

export function workingPlanned(item: Pick<LiveItemView, "sets">): PlanSet[] {
  return item.sets
    .map((s) => s.planned)
    .filter((p): p is PlanSet => !!p && p.type === "working");
}

/** Planned cardio minutes: "5 + 35 min". */
export function plannedMinutes(item: Pick<LiveItemView, "sets">): { label: string; total: number } | null {
  const mins = item.sets.map((s) => s.planned?.reps[1]).filter((m): m is number => m != null);
  if (mins.length === 0) return null;
  return { label: `${mins.join(" + ")} min`, total: mins.reduce((a, b) => a + b, 0) };
}

/** "3 × 8–10" from the planned working sets ("35 min" for cardio's main block). */
export function targetLabel(item: Pick<LiveItemView, "sets" | "exercise">): string | null {
  if (item.exercise.loadMode === "TIME") {
    const main = workingPlanned(item).map((s) => s.reps[1]);
    return main.length ? `${main.join(" + ")} min` : plannedMinutes(item)?.label ?? null;
  }
  const working = workingPlanned(item);
  if (working.length === 0) return null;
  const lo = Math.min(...working.map((s) => s.reps[0]));
  const hi = Math.max(...working.map((s) => s.reps[1]));
  return `${working.length} × ${repRange([lo, hi])}`;
}

export function targetRpe(item: Pick<LiveItemView, "sets">): number | null {
  return workingPlanned(item).find((s) => s.rpe != null)?.rpe ?? null;
}

export function openKg(item: Pick<LiveItemView, "sets">): number | null {
  return workingPlanned(item).find((s) => s.openKg != null)?.openKg ?? null;
}

/** "47 kg", "47 cw", "21.1/side". */
export function loadWithUnit(mode: LoadMode, kg: number): string {
  if (mode === "TIME") return "—";
  return mode === "TOTAL" ? `${formatKg(kg)} kg` : formatLoad(mode, kg);
}

/** Up-next row: "3 × 8–10, 57". */
export function upNextSummary(item: LiveItemView): string {
  const target = targetLabel(item);
  if (item.exercise.loadMode === "TIME") return plannedMinutes(item)?.label ?? target ?? `${item.sets.length} blocks`;
  const open = openKg(item);
  const parts = [target, open != null ? formatLoad(item.exercise.loadMode, open) : null].filter(Boolean);
  return parts.length ? parts.join(", ") : `${item.sets.length} sets`;
}

export function loggedSets(item: Pick<LiveItemView, "sets">): SetLogEntry[] {
  return item.sets.map((s) => s.logged).filter((s): s is SetLogEntry => !!s);
}

/**
 * Completed row: "3 × 47 cw, RPE 8" when every working set used the same
 * load, otherwise the top set "85 × 5". `pr` = any set flagged top_set_pr.
 */
export function completedSummary(item: LiveItemView): { text: string; pr: boolean } {
  const mode = item.exercise.loadMode;
  const sets = loggedSets(item);
  const working = sets.filter((s) => s.type !== "warmup");
  const pool = working.length ? working : sets;
  const pr = sets.some((s) => s.flags?.includes("top_set_pr"));
  if (pool.length === 0) return { text: "—", pr };
  if (mode === "TIME") {
    const total = sets.reduce((a, s) => a + s.reps, 0);
    const hr = sets.map((s) => s.avgHr).filter((h): h is number => h != null);
    return { text: `${total} min${hr.length ? `, avg HR ${Math.round(hr.reduce((a, b) => a + b, 0) / hr.length)}` : ""}`, pr: false };
  }
  const top = topSet(mode, pool);
  const rpes = pool.map((s) => s.rpe).filter((r): r is number => r != null);
  const rpe = rpes.length ? `, RPE ${Math.max(...rpes)}` : "";
  const sameLoad = pool.every((s) => s.weight === pool[0].weight);
  if (sameLoad && !pr) {
    return { text: `${pool.length} × ${formatLoad(mode, pool[0].weight)}${rpe}`, pr };
  }
  return { text: top ? `${formatLoad(mode, top.weight)} × ${top.reps}` : "—", pr };
}

/** "mm:ss" (or "h:mm:ss" past an hour). */
export function clock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${String(m).padStart(2, "0")}:${sec}`;
}

/** Rest timer style "1:42". */
export function shortClock(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
