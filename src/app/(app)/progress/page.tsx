import { requireUserEmail } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions, exercises } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import ProgressCharts from "@/components/progress-charts";

const COMPOUND_LIFTS = [
  "Barbell Bench Press",
  "Barbell Back Squat",
  "Conventional Deadlift",
  "Barbell OHP",
  "Barbell Bent Over Row",
];

export default async function ProgressPage() {
  const email = await requireUserEmail();

  const [compoundExercises, userSessions] = await Promise.all([
    db
      .select({ id: exercises.id, name: exercises.name })
      .from(exercises)
      .where(inArray(exercises.name, COMPOUND_LIFTS)),
    db.query.sessions.findMany({
      where: eq(sessions.userId, email),
      orderBy: [desc(sessions.date)],
      limit: 200,
      with: {
        sessionExercises: {
          with: { exercise: true },
        },
      },
    }),
  ]);

  // Build chart data for compound lifts
  const lifts = compoundExercises.map((ce) => ({
    name: ce.name,
    data: userSessions
      .flatMap((s) =>
        s.sessionExercises
          .filter((se) => se.exerciseId === ce.id)
          .map((se) => ({
            date: s.date,
            weight: parseFloat(se.weight),
          }))
      )
      .reverse(),
  }));

  // Build working weights for ALL exercises used
  const exerciseMap = new Map<
    string,
    { name: string; weights: { weight: number; date: string }[] }
  >();

  for (const s of userSessions) {
    for (const se of s.sessionExercises) {
      if (!exerciseMap.has(se.exerciseId)) {
        exerciseMap.set(se.exerciseId, {
          name: se.exercise.name,
          weights: [],
        });
      }
      exerciseMap.get(se.exerciseId)!.weights.push({
        weight: parseFloat(se.weight),
        date: s.date,
      });
    }
  }

  const workingWeights = Array.from(exerciseMap.values())
    .map((entry) => {
      const sorted = entry.weights.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const current = sorted[0];
      const previous = sorted[1] ?? null;
      return {
        exerciseName: entry.name,
        currentWeight: current.weight,
        previousWeight: previous?.weight ?? null,
        lastUsed: current.date,
        trend: (previous
          ? current.weight > previous.weight
            ? "up"
            : current.weight < previous.weight
              ? "down"
              : "same"
          : "same") as "up" | "same" | "down",
      };
    })
    .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));

  return (
    <div className="py-6">
      <h2 className="text-2xl font-black tracking-tight mb-6">PROGRESS</h2>
      <ProgressCharts lifts={lifts} workingWeights={workingWeights} />
    </div>
  );
}
