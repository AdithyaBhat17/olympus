import "server-only";
import { z } from "zod";
import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, type SessionHeartRate } from "@/lib/db/schema";

/**
 * Heart rate lives in Health on the phone, so the iOS app does the reading:
 * it asks for recent session windows, reads HR from Health for each, and
 * posts one summary per session back. Sessions without both timestamps
 * (logged from chat after the fact) have no window and are skipped.
 */

/** Longer than this and the session was left open, not trained through. */
const MAX_WINDOW_MIN = 4 * 60;
const MIN_WINDOW_MIN = 5;

export interface SessionWindow {
  id: string;
  /** Epoch ms. */
  startMs: number;
  endMs: number;
}

/** Finished sessions started in the last `days` days that have a believable window. */
export async function sessionWindows(userId: string, days: number): Promise<SessionWindow[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({ id: sessions.id, startedAt: sessions.startedAt, finishedAt: sessions.finishedAt })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessions.status, "DONE"),
        isNotNull(sessions.startedAt),
        isNotNull(sessions.finishedAt),
        gte(sessions.startedAt, since)
      )
    );
  return rows.flatMap((r) => {
    const startMs = r.startedAt!.getTime();
    const endMs = r.finishedAt!.getTime();
    const min = (endMs - startMs) / 60_000;
    return min >= MIN_WINDOW_MIN && min <= MAX_WINDOW_MIN ? [{ id: r.id, startMs, endMs }] : [];
  });
}

const bpm = z.number().int().min(30).max(240);

export const heartRateBody = z.object({
  sessions: z
    .array(
      z
        .object({
          id: z.string().uuid(),
          device: z.string().trim().min(1).max(80).optional(),
          avgHr: bpm,
          maxHr: bpm,
          coveredMin: z.number().int().min(1).max(MAX_WINDOW_MIN),
        })
        .refine((s) => s.maxHr >= s.avgHr, "maxHr below avgHr")
    )
    .max(100),
});

export type HeartRateBody = z.infer<typeof heartRateBody>;

/** Stores each summary on the athlete's own session; returns how many were saved. */
export async function saveSessionHeartRates(userId: string, body: HeartRateBody): Promise<number> {
  if (body.sessions.length === 0) return 0;
  const owned = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        inArray(
          sessions.id,
          body.sessions.map((s) => s.id)
        )
      )
    );
  const mine = new Set(owned.map((r) => r.id));
  let saved = 0;
  // neon-http has no transactions; each row stands alone and a re-sync rewrites it.
  for (const s of body.sessions) {
    if (!mine.has(s.id)) continue;
    const heartRate: SessionHeartRate = {
      source: "apple_health",
      ...(s.device ? { device: s.device } : {}),
      avgHr: s.avgHr,
      maxHr: s.maxHr,
      coveredMin: s.coveredMin,
    };
    await db
      .update(sessions)
      .set({ heartRate })
      .where(and(eq(sessions.id, s.id), eq(sessions.userId, userId)));
    saved++;
  }
  return saved;
}
