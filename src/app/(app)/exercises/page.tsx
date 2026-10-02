import { requireUserEmail } from "@/lib/auth";
import { describeExercise, getConstraints, listExerciseRows, toDomainExercise } from "@/server/exercises";
import ExerciseList, { type LibraryExercise } from "@/components/exercise-list";

export const metadata = { title: "Library" };

export default async function ExercisesPage() {
  const email = await requireUserEmail();
  const [rows, cons] = await Promise.all([listExerciseRows(email), getConstraints(email)]);
  const all = rows.map(toDomainExercise);

  const items: LibraryExercise[] = rows.map((row, i) => {
    const hit = describeExercise(all[i], all, cons);
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      status: row.status,
      isCustom: row.isCustom,
      loadMode: all[i].loadMode,
      carriageKgPerSide: all[i].carriageKgPerSide,
      blocked: hit.blocked,
      blockedReason: hit.blockedReason,
      substitutes: hit.substitutes.map((s) => s.name),
    };
  });

  return (
    <div className="flex flex-col pb-8">
      <header className="px-5 pb-1 flex flex-col gap-0.5 pt-[max(56px,calc(env(safe-area-inset-top)_+_12px))]">
        <span className="eyebrow font-normal">
          {items.filter((e) => !e.blocked).length} available · {items.filter((e) => e.blocked).length} blocked
        </span>
        <h1 className="font-display font-bold text-[44px] leading-none">Library</h1>
      </header>
      <ExerciseList exercises={items} />
    </div>
  );
}
