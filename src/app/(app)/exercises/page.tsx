import { requireUserEmail } from "@/lib/auth";
import { blockingConstraint } from "@/domain";
import { describeExercise, getConstraints, listExerciseRows, toDomainExercise } from "@/server/exercises";
import { workingWeights } from "@/server/history";
import { PageHeader } from "@/components/page-header";
import ExerciseList, { type LibraryExercise } from "@/components/exercise-list";

export const metadata = { title: "Library" };

export default async function ExercisesPage() {
  const email = await requireUserEmail();
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

  return (
    <div className="flex flex-col">
      <PageHeader eyebrow={`${items.length} exercises, ${blocked} blocked`} title="Library" />
      <ExerciseList exercises={items} />
    </div>
  );
}
