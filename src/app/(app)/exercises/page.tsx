import { db } from "@/lib/db";
import { exercises } from "@/lib/db/schema";
import ExerciseList from "@/components/exercise-list";
import type { Exercise } from "@/lib/types";

export default async function ExercisesPage() {
  const allExercises = await db
    .select()
    .from(exercises)
    .orderBy(exercises.category, exercises.name);

  return (
    <div className="py-6">
      <h2 className="text-2xl font-black tracking-tight mb-6">EXERCISES</h2>
      <ExerciseList exercises={allExercises as Exercise[]} />
    </div>
  );
}
