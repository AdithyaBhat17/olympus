import "server-only";
import { z } from "zod";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { exercises, sessionExercises, sessions } from "@/lib/db/schema";
import { EXERCISE_CATEGORIES } from "@/lib/constants";
import { DomainError } from "./errors";

/**
 * Logging a past session by hand, deleting sessions, and custom exercises.
 * The web's legacy server actions (src/lib/actions.ts) and /api/v1 share these.
 */

export const saveSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  sessionName: z.string().min(1).max(100),
  weekNumber: z.number().int().min(1).max(12),
  blockNumber: z.enum(["1", "2", "3", "Deload"]),
  notes: z.string().max(2000).nullable(),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().uuid(),
        sets: z
          .array(
            z.object({
              reps: z.number().int().min(1).max(1000),
              weight: z.number().min(0).max(9999),
            })
          )
          .min(1)
          .max(100),
        rpe: z.number().min(5).max(10).nullable(),
        notes: z.string().max(500).nullable(),
        orderIndex: z.number().int().min(0),
      })
    )
    .min(1)
    .max(50),
});

export const createExerciseSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum(EXERCISE_CATEGORIES as unknown as [string, ...string[]]),
});

export async function saveManualSession(userId: string, v: z.infer<typeof saveSessionSchema>) {
  const [newSession] = await db
    .insert(sessions)
    .values({
      userId,
      date: v.date,
      sessionName: v.sessionName,
      weekNumber: v.weekNumber,
      blockNumber: v.blockNumber,
      notes: v.notes,
    })
    .returning({ id: sessions.id });

  await db.insert(sessionExercises).values(
    v.exercises.map((ex) => {
      const maxReps = Math.max(...ex.sets.map((s) => s.reps));
      const maxWeight = Math.max(...ex.sets.map((s) => s.weight));
      return {
        sessionId: newSession.id,
        exerciseId: ex.exerciseId,
        sets: ex.sets.length,
        reps: maxReps,
        weight: maxWeight.toFixed(2),
        setDetails: ex.sets,
        rpe: ex.rpe?.toFixed(1) ?? null,
        notes: ex.notes,
        orderIndex: ex.orderIndex,
      };
    })
  );
  return { id: newSession.id };
}

export async function deleteSessionFor(userId: string, sessionId: string): Promise<void> {
  const result = await db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .returning({ id: sessions.id });
  if (result.length === 0) throw new DomainError("Session not found");
}

export async function lastSessionByName(userId: string, sessionName: string) {
  const result = await db.query.sessions.findFirst({
    where: and(eq(sessions.userId, userId), eq(sessions.sessionName, sessionName)),
    orderBy: [desc(sessions.date)],
    with: {
      sessionExercises: {
        with: { exercise: true },
        orderBy: [asc(sessionExercises.orderIndex)],
      },
    },
  });
  return result ?? null;
}

export async function createCustomExerciseFor(userId: string, data: z.infer<typeof createExerciseSchema>) {
  const [exercise] = await db
    .insert(exercises)
    .values({
      name: data.name,
      category: data.category as typeof exercises.$inferInsert.category,
      status: "YES",
      isCustom: true,
      createdBy: userId,
    })
    .returning();
  return exercise;
}

/** What the manual log form picks from: visible exercises and session names used before. */
export async function manualLogOptions(userId: string) {
  const [allExercises, recentNames] = await Promise.all([
    db
      .select()
      .from(exercises)
      .where(or(isNull(exercises.createdBy), eq(exercises.createdBy, userId)))
      .orderBy(exercises.name),
    db.selectDistinct({ sessionName: sessions.sessionName }).from(sessions).where(eq(sessions.userId, userId)),
  ]);
  return { exercises: allExercises, recentSessionNames: recentNames.map((s) => s.sessionName) };
}
