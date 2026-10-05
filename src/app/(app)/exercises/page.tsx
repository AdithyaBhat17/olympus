import { requireUserEmail } from "@/lib/auth";
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
      status: row.status,
      isCustom: row.isCustom,
      loadMode: ex.loadMode,
      carriageKgPerSide: ex.carriageKgPerSide,
      isCompound: ex.isCompound,
      equipment: ex.equipment ?? null,
      hasFormCues: !!row.formCueId,
      workingKg: ww.get(row.id)?.kg ?? null,
      blocked: hit.blocked,
      blockedReason: hit.blockedReason,
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
