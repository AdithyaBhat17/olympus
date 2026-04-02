import { requireUserEmail } from "@/lib/auth";
import { db } from "@/lib/db";
import { exercises } from "@/lib/db/schema";
import { or, isNull, eq } from "drizzle-orm";
import ExerciseList from "@/components/exercise-list";
import type { Exercise } from "@/lib/types";

export default async function ExercisesPage() {
  const email = await requireUserEmail();

  const allExercises = await db
    .select()
    .from(exercises)
    .where(or(isNull(exercises.createdBy), eq(exercises.createdBy, email)))
    .orderBy(exercises.category, exercises.name);

  return (
    <div className="py-6">
      <h2 className="text-2xl font-black tracking-tight mb-6">EXERCISES</h2>
      <ExerciseList exercises={allExercises as Exercise[]} />
    </div>
  );
}
