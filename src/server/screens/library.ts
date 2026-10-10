import "server-only";
import { blockingConstraint } from "@/domain";
import { describeExercise, getConstraints, listExerciseRows, toDomainExercise } from "@/server/exercises";
import { workingWeights } from "@/server/history";
import type { LibraryExercise } from "@/components/exercise-list";

/** The Library tab: every visible exercise, why it's blocked, what to use instead. */
export async function libraryScreen(email: string) {
  const [rows, cons] = await Promise.all([listExerciseRows(email), getConstraints(email)]);
  const all = rows.map(toDomainExercise);
  const ww = await workingWeights(email, all);

  const items: LibraryExercise[] = rows.map((row, i) => {
    const ex = all[i];
    const hit = describeExercise(ex, all, cons);
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      status: ex.status,
      isCustom: row.isCustom,
      loadMode: ex.loadMode,
      carriageKgPerSide: ex.carriageKgPerSide,
      isCompound: ex.isCompound,
      equipment: ex.equipment ?? null,
      hasFormCues: !!row.formCueId,
      workingKg: ww.get(row.id)?.kg ?? null,
      blocked: hit.blocked,
      blockedReason: hit.blockedReason,
      // An injury rule outranks a personal block: unblocking wouldn't free it.
      blockedBy: !hit.blocked ? null : blockingConstraint(ex, cons) ? "injury" : row.userBlock ? "you" : "library",
      substitutes: hit.substitutes.map((s) => s.name),
    };
  });
  const blocked = items.filter((e) => e.blocked).length;

  return { eyebrow: `${items.length} exercises, ${blocked} blocked`, exercises: items };
}

export type LibraryScreen = Awaited<ReturnType<typeof libraryScreen>>;
