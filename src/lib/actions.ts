"use server";

import { z } from "zod";
import { requireUserEmail } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  sessions,
  sessionExercises,
  exercises,
} from "@/lib/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { EXERCISE_CATEGORIES } from "./constants";

// --- Validation schemas ---

const saveSessionSchema = z.object({
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

const createExerciseSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum(EXERCISE_CATEGORIES as unknown as [string, ...string[]]),
});

export async function saveSession(data: z.input<typeof saveSessionSchema>) {
  const userEmail = await requireUserEmail();

  const parsed = saveSessionSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid session data");
  }
  const v = parsed.data;

  try {
    const [newSession] = await db
      .insert(sessions)
      .values({
        userId: userEmail,
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

    revalidatePath("/history");
    revalidatePath("/progress");
    return { id: newSession.id };
  } catch (err) {
    console.error("saveSession failed:", err);
    throw new Error("Failed to save session");
  }
}

export async function deleteSession(sessionId: string) {
  const userEmail = await requireUserEmail();

  const parsed = z.string().uuid().safeParse(sessionId);
  if (!parsed.success) {
    throw new Error("Invalid session ID");
  }

  try {
    const result = await db
      .delete(sessions)
      .where(
        and(eq(sessions.id, parsed.data), eq(sessions.userId, userEmail))
      )
      .returning({ id: sessions.id });

    if (result.length === 0) {
      throw new Error("Session not found");
    }

    revalidatePath("/history");
    revalidatePath("/progress");
  } catch (err) {
    console.error("deleteSession failed:", err);
    throw new Error("Failed to delete session");
  }
}

export async function getLastSessionByName(sessionName: string) {
  const userEmail = await requireUserEmail();

  const parsed = z.string().min(1).max(100).safeParse(sessionName);
  if (!parsed.success) {
    throw new Error("Invalid session name");
  }

  try {
    const result = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.userId, userEmail),
        eq(sessions.sessionName, parsed.data)
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
  } catch (err) {
    console.error("getLastSessionByName failed:", err);
    throw new Error("Failed to load session");
  }
}

export async function createCustomExercise(data: {
  name: string;
  category: string;
}) {
  const userEmail = await requireUserEmail();

  const parsed = createExerciseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid exercise data");
  }

  try {
    const [exercise] = await db
      .insert(exercises)
      .values({
        name: parsed.data.name,
        category: parsed.data.category as typeof exercises.$inferInsert.category,
        status: "YES",
        isCustom: true,
        createdBy: userEmail,
      })
      .returning();

    revalidatePath("/exercises");
    return exercise;
  } catch (err) {
    console.error("createCustomExercise failed:", err);
    throw new Error("Failed to create exercise");
  }
}
