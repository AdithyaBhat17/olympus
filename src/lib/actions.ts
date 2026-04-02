"use server";

import { requireUserEmail } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  sessions,
  sessionExercises,
  exercises,
} from "@/lib/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function saveSession(data: {
  date: string;
  sessionName: string;
  weekNumber: number;
  blockNumber: string;
  notes: string | null;
  exercises: Array<{
    exerciseId: string;
    sets: number;
    reps: number;
    weight: number;
    rpe: number | null;
    notes: string | null;
    orderIndex: number;
  }>;
}) {
  const userEmail = await requireUserEmail();

  const [newSession] = await db
    .insert(sessions)
    .values({
      userId: userEmail,
      date: data.date,
      sessionName: data.sessionName,
      weekNumber: data.weekNumber,
      blockNumber: data.blockNumber,
      notes: data.notes,
    })
    .returning({ id: sessions.id });

  if (data.exercises.length > 0) {
    await db.insert(sessionExercises).values(
      data.exercises.map((ex) => ({
        sessionId: newSession.id,
        exerciseId: ex.exerciseId,
        sets: ex.sets,
        reps: ex.reps,
        weight: ex.weight.toFixed(2),
        rpe: ex.rpe?.toFixed(1) ?? null,
        notes: ex.notes,
        orderIndex: ex.orderIndex,
      }))
    );
  }

  revalidatePath("/history");
  revalidatePath("/progress");
  return { id: newSession.id };
}

export async function deleteSession(sessionId: string) {
  const userEmail = await requireUserEmail();

  await db
    .delete(sessions)
    .where(
      and(eq(sessions.id, sessionId), eq(sessions.userId, userEmail))
    );

  revalidatePath("/history");
  revalidatePath("/progress");
}

export async function getLastSessionByName(sessionName: string) {
  const userEmail = await requireUserEmail();

  const result = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.userId, userEmail),
      eq(sessions.sessionName, sessionName)
    ),
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

export async function createCustomExercise(data: {
  name: string;
  category: string;
}) {
  await requireUserEmail();

  const [exercise] = await db
    .insert(exercises)
    .values({
      name: data.name,
      category: data.category as typeof exercises.$inferInsert.category,
      status: "YES",
      isCustom: true,
    })
    .returning();

  revalidatePath("/exercises");
  return exercise;
}
