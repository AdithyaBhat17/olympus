"use server";

import { z } from "zod";
import { requireUserEmail } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  createCustomExerciseFor,
  createExerciseSchema,
  deleteSessionFor,
  lastSessionByName,
  saveManualSession,
  saveSessionSchema,
} from "@/server/manual-log";

// Legacy actions: they throw on failure (the forms catch and toast). The logic
// lives in src/server/manual-log.ts, shared with /api/v1.

export async function saveSession(data: z.input<typeof saveSessionSchema>) {
  const userEmail = await requireUserEmail();

  const parsed = saveSessionSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid session data");
  }

  try {
    const saved = await saveManualSession(userEmail, parsed.data);
    revalidatePath("/history");
    revalidatePath("/progress");
    return saved;
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
    await deleteSessionFor(userEmail, parsed.data);
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
    return await lastSessionByName(userEmail, parsed.data);
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
    const exercise = await createCustomExerciseFor(userEmail, parsed.data);
    revalidatePath("/exercises");
    return exercise;
  } catch (err) {
    console.error("createCustomExercise failed:", err);
    throw new Error("Failed to create exercise");
  }
}
