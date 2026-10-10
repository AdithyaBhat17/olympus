import "server-only";
import { getConstraints, listExerciseRows, toDomainExercise } from "@/server/exercises";
import { workingWeights } from "@/server/history";
import { formatKg, type LoadMode } from "@/domain";
import { FORM_CUE_TITLES, type FormCueId } from "@/components/form-cues/cue-ids";
import { FORM_DEFS } from "@/components/form-cues/defs";

function loadText(mode: LoadMode, kg: number): string {
  if (mode === "PER_SIDE") return `${formatKg(kg)} kg a side`;
  if (mode === "COUNTERWEIGHT") return `${formatKg(kg)} kg counterweight`;
  return `${formatKg(kg)} kg`;
}

/**
 * Title and eyebrow for a form cue, personalised: ?ex= when linked from a lift,
 * else the linked exercise trained most recently.
 */
export async function formCueScreen(userId: string, cue: FormCueId, wanted: string | null) {
  // The exercise this cue belongs to: ?ex= when linked from a lift, else the
  // linked exercise trained most recently.
  const [rows, constraints] = await Promise.all([listExerciseRows(userId), getConstraints(userId)]);
  const candidates = rows.filter((r) => r.formCueId === cue).map(toDomainExercise);
  const ww = candidates.length
    ? await workingWeights(userId, candidates, { exerciseIds: candidates.map((c) => c.id) })
    : new Map<string, { kg: number; date: string; source: "log" | "override" }>();
  const ex =
    candidates.find((c) => c.id === wanted) ??
    [...candidates].sort((a, b) => (ww.get(b.id)?.date ?? "").localeCompare(ww.get(a.id)?.date ?? ""))[0] ??
    null;
  const current = ex ? ww.get(ex.id) ?? null : null;

  // Constraint region the cue protects, e.g. "Right knee" on the squat.
  const needle = cue === "squat" ? "knee" : cue === "pushdown" ? "wrist" : null;
  const region = needle ? constraints.find((k) => k.region.toLowerCase().includes(needle))?.region.split(" · ")[0] : null;

  const eyebrow = [
    "3D form",
    ex && current ? loadText(ex.loadMode, current.kg) : null,
    region,
    FORM_DEFS[cue].copy.tag,
  ]
    .filter(Boolean)
    .join(", ");

  return { cue, title: ex?.name ?? FORM_CUE_TITLES[cue].title, eyebrow };
}
