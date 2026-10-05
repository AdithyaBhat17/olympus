"use server";

/**
 * Server actions for the LiftLog v2 screens. Thin wrappers: auth + input
 * validation here, every rule lives in src/domain and src/server.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUserEmail } from "@/lib/auth";
import {
  DomainError,
  discardSession,
  finishSession,
  logSet,
  removeSet,
  saveSessionNotes,
  sendToPT,
  startSession,
  swapExercise,
  type LogSetResult,
} from "@/server/sessions";
import { planFromLastSession } from "@/server/plans";
import { upsertCheckIn } from "@/server/checkins";
import { addFlag, resolveFlag } from "@/server/flags";
import { setCarriage, setExerciseBlock } from "@/server/exercises";
import { todayFor } from "@/server/profile";
import { updateWorkingWeight } from "@/server/working-weight";
import { deleteSubscription, saveSubscription, sendPushToUser } from "@/server/push";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    if (err instanceof z.ZodError) return { ok: false, error: "Invalid input" };
    console.error(err);
    return { ok: false, error: "Something went wrong" };
  }
}

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// --- Starting / ending sessions ---------------------------------------------

/** Start (or resume) the live session for a plan. Returns the session id. */
export async function startSessionAction(planId: string): Promise<ActionResult<string>> {
  return run(async () => {
    const userId = await requireUserEmail();
    const id = await startSession(userId, uuid.parse(planId));
    revalidatePath("/today");
    return id;
  });
}

/**
 * No plan from Claude: build one from the last session of this type and
 * start it. Returns the session id.
 */
export async function startFromRotationAction(
  sessionType: string
): Promise<ActionResult<string>> {
  return run(async () => {
    const userId = await requireUserEmail();
    const t = z.string().min(1).max(20).parse(sessionType);
    const res = await planFromLastSession(userId, t);
    if (!res.planId) {
      throw new DomainError(res.errors[0]?.message ?? "Couldn't build a plan");
    }
    const id = await startSession(userId, res.planId);
    revalidatePath("/today");
    return id;
  });
}

const logSetSchema = z.object({
  exerciseId: uuid,
  planItemId: uuid.nullable().optional(),
  setIndex: z.number().int().min(0).max(100),
  platesKg: z.number().min(0).max(9999).nullable().optional(),
  weight: z.number().min(0).max(9999).nullable().optional(),
  reps: z.number().int().min(0).max(1000),
  rpe: z.number().min(1).max(10).nullable().optional(),
  type: z.enum(["warmup", "working"]).optional(),
  blockedOverride: z.boolean().optional(),
});

export async function logSetAction(
  sessionId: string,
  input: z.input<typeof logSetSchema>
): Promise<ActionResult<LogSetResult>> {
  return run(async () => {
    const userId = await requireUserEmail();
    return logSet(userId, uuid.parse(sessionId), logSetSchema.parse(input));
  });
}

export async function removeSetAction(
  sessionId: string,
  input: { exerciseId: string; planItemId?: string | null; setIndex: number }
): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserEmail();
    await removeSet(
      userId,
      uuid.parse(sessionId),
      z
        .object({ exerciseId: uuid, planItemId: uuid.nullable().optional(), setIndex: z.number().int().min(0) })
        .parse(input)
    );
    return undefined;
  });
}

export async function swapExerciseAction(
  sessionId: string,
  input: { planItemId: string; exerciseId: string; overrideReason?: string | null }
): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserEmail();
    const v = z
      .object({
        planItemId: uuid,
        exerciseId: uuid,
        overrideReason: z.string().max(300).nullable().optional(),
      })
      .parse(input);
    await swapExercise(userId, uuid.parse(sessionId), {
      planItemId: v.planItemId,
      exerciseRef: v.exerciseId,
      overrideReason: v.overrideReason,
    });
    revalidatePath(`/session/${sessionId}`);
    return undefined;
  });
}

export async function finishSessionAction(
  sessionId: string,
  notes: string | null
): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserEmail();
    await finishSession(userId, uuid.parse(sessionId), z.string().max(2000).nullable().parse(notes));
    revalidatePath("/today");
    revalidatePath("/history");
    revalidatePath("/progress");
    return undefined;
  });
}

export async function saveSessionNotesAction(
  sessionId: string,
  notes: string | null
): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserEmail();
    await saveSessionNotes(userId, uuid.parse(sessionId), z.string().max(2000).nullable().parse(notes));
    return undefined;
  });
}

/** Finish ▸ "Send to PT": marks DONE + stamps sentAt for get_sessions. */
export async function sendToPTAction(
  sessionId: string,
  notes: string | null
): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserEmail();
    await sendToPT(userId, uuid.parse(sessionId), z.string().max(2000).nullable().parse(notes));
    revalidatePath("/today");
    revalidatePath("/history");
    return undefined;
  });
}

export async function discardSessionAction(sessionId: string): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserEmail();
    await discardSession(userId, uuid.parse(sessionId));
    revalidatePath("/today");
    return undefined;
  });
}

// --- Recovery check-in ------------------------------------------------------

export async function upsertCheckInAction(input: {
  date?: string;
  sleepMin?: number | null;
  proteinG?: number | null;
  waterMl?: number | null;
}): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserEmail();
    const v = z
      .object({
        date: isoDate.optional(),
        sleepMin: z.number().int().min(0).max(1440).nullable().optional(),
        proteinG: z.number().int().min(0).max(1000).nullable().optional(),
        waterMl: z.number().int().min(0).max(20000).nullable().optional(),
      })
      .parse(input);
    const { date, ...patch } = v;
    await upsertCheckIn(userId, date ?? (await todayFor(userId)), patch, "manual");
    revalidatePath("/today");
    return undefined;
  });
}

// --- Coach flags ------------------------------------------------------------

export async function resolveFlagAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserEmail();
    await resolveFlag(userId, uuid.parse(id));
    revalidatePath("/today");
    return undefined;
  });
}

export async function addFlagAction(text: string): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserEmail();
    await addFlag(userId, { text: z.string().min(1).max(300).parse(text), scope: "global" }, "user");
    revalidatePath("/today");
    return undefined;
  });
}

// --- Library ----------------------------------------------------------------

export async function setCarriageAction(
  exerciseId: string,
  kgPerSide: number | null
): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserEmail();
    await setCarriage(
      userId,
      uuid.parse(exerciseId),
      z.number().min(0).max(100).nullable().parse(kgPerSide)
    );
    revalidatePath("/exercises");
    return undefined;
  });
}

/** Block a library exercise for this athlete (reason), or unblock it (null). */
export async function setExerciseBlockAction(
  exerciseId: string,
  reason: string | null
): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserEmail();
    const id = uuid.parse(exerciseId);
    await setExerciseBlock(userId, id, z.string().max(200).nullable().parse(reason));
    revalidatePath("/exercises");
    revalidatePath(`/progress/${id}`);
    return undefined;
  });
}

export async function updateWorkingWeightAction(input: {
  exerciseId: string;
  kg: number;
  reason: string;
  force?: boolean;
}): Promise<ActionResult<{ ok: boolean; message: string }>> {
  return run(async () => {
    const userId = await requireUserEmail();
    const v = z
      .object({
        exerciseId: uuid,
        kg: z.number().min(0).max(1000),
        reason: z.string().min(1).max(300),
        force: z.boolean().optional(),
      })
      .parse(input);
    const res = await updateWorkingWeight(userId, v, "user");
    revalidatePath("/progress", "layout");
    return { ok: res.ok, message: res.message };
  });
}

// --- Web push ---------------------------------------------------------------

export async function savePushSubscriptionAction(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserEmail();
    await saveSubscription(
      userId,
      z
        .object({
          endpoint: z.string().url().max(1000),
          keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(200) }),
        })
        .parse(sub)
    );
    return undefined;
  });
}

export async function deletePushSubscriptionAction(endpoint: string): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserEmail();
    await deleteSubscription(userId, z.string().url().parse(endpoint));
    return undefined;
  });
}

// --- Rest timer push ----------------------------------------------------------

/**
 * Latest rest-push token per user. In-process only: a reschedule or cancel
 * that lands on another instance can't stop an earlier push, so the client
 * only schedules when the app is backgrounded and the worker drops rest
 * pushes while a window is visible.
 */
const restPushTokens = new Map<string, string>();
const MAX_REST_MS = 10 * 60 * 1000;

/** The app went to the background mid-rest: push "Rest's up" at endAt. */
export async function scheduleRestPushAction(input: {
  sessionId: string;
  endAt: number;
  body: string;
}): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserEmail();
    const v = z
      .object({ sessionId: uuid, endAt: z.number().int().positive(), body: z.string().max(120) })
      .parse(input);
    const delay = v.endAt - Date.now();
    if (delay <= 0 || delay > MAX_REST_MS) return undefined;
    const token = `${v.endAt}-${Math.random().toString(36).slice(2)}`;
    restPushTokens.set(userId, token);
    after(async () => {
      await new Promise((r) => setTimeout(r, delay));
      if (restPushTokens.get(userId) !== token) return;
      restPushTokens.delete(userId);
      await sendPushToUser(
        userId,
        { title: "Rest's up", body: v.body, url: `/session/${v.sessionId}`, tag: "olympus-rest" },
        { ttlSec: 60 }
      );
    });
    return undefined;
  });
}

export async function cancelRestPushAction(): Promise<ActionResult> {
  return run(async () => {
    const userId = await requireUserEmail();
    restPushTokens.delete(userId);
    return undefined;
  });
}
