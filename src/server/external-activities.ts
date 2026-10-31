import "server-only";
import { z } from "zod";
import { and, asc, eq, gte, isNotNull, lte, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { externalActivities, sessions } from "@/lib/db/schema";
import { addDays, formatTimeInTz, isoDateInTz } from "@/lib/dates";
import { getProfile } from "./profile";
import { outsideSessions } from "./activity-overlap";

/**
 * Workouts from Apple Health (Watch, Garmin Connect, Strava...), so Claude
 * sees the training Olympus didn't log. The app de-duplicates devices before
 * sending (OlympusCore.distinctWorkouts); here a sync replaces its range.
 */

const bpm = z.number().int().min(30).max(240);

const activity = z
  .object({
    id: z.string().min(1).max(64),
    activityType: z.string().trim().min(1).max(40),
    device: z.string().trim().min(1).max(80).optional(),
    startMs: z.number().int().positive(),
    endMs: z.number().int().positive(),
    distanceM: z.number().int().min(0).max(1_000_000).optional(),
    activeKcal: z.number().int().min(0).max(20_000).optional(),
    avgHr: bpm.optional(),
    maxHr: bpm.optional(),
    hrCoveredMin: z.number().int().min(1).max(1440).optional(),
  })
  .refine((a) => a.endMs > a.startMs && a.endMs - a.startMs <= 86_400_000, "Not a believable duration");

export const activitiesBody = z
  .object({
    /** Epoch ms. Everything the app read starts at or after this. */
    fromMs: z.number().int().positive(),
    activities: z.array(activity).max(300),
  })
  .refine((b) => b.activities.every((a) => a.startMs >= b.fromMs), "Activity before fromMs");

export type ActivitiesBody = z.infer<typeof activitiesBody>;

/**
 * Upserts every activity and drops this source's rows from `fromMs` on that
 * the app no longer sends: deleted in Health, or now a duplicate.
 */
export async function replaceActivities(userId: string, body: ActivitiesBody): Promise<number> {
  const { timezone } = await getProfile(userId);
  const from = new Date(body.fromMs);
  const ids = body.activities.map((a) => a.id);
  await db
    .delete(externalActivities)
    .where(
      and(
        eq(externalActivities.userId, userId),
        eq(externalActivities.source, "apple_health"),
        gte(externalActivities.startedAt, from),
        ids.length ? notInArray(externalActivities.externalId, ids) : undefined
      )
    );
  for (const a of body.activities) {
    const row = {
      date: isoDateInTz(new Date(a.startMs), timezone),
      startedAt: new Date(a.startMs),
      endedAt: new Date(a.endMs),
      activityType: a.activityType,
      device: a.device ?? null,
      durationMin: Math.max(1, Math.round((a.endMs - a.startMs) / 60_000)),
      distanceM: a.distanceM ?? null,
      activeKcal: a.activeKcal ?? null,
      avgHr: a.avgHr ?? null,
      maxHr: a.maxHr ?? null,
      hrCoveredMin: a.hrCoveredMin ?? null,
      updatedAt: new Date(),
    };
    await db
      .insert(externalActivities)
      .values({ userId, source: "apple_health", externalId: a.id, ...row })
      .onConflictDoUpdate({
        target: [externalActivities.userId, externalActivities.source, externalActivities.externalId],
        set: row,
      });
  }
  return body.activities.length;
}

/** Activities over the `days` ending `date`, minus ones that are an Olympus session too. Oldest first. */
export async function listActivities(userId: string, date: string, days: number) {
  const { timezone } = await getProfile(userId);
  const from = addDays(date, -(days - 1));
  const [rows, olympus] = await Promise.all([
    db
      .select()
      .from(externalActivities)
      .where(
        and(
          eq(externalActivities.userId, userId),
          gte(externalActivities.date, from),
          lte(externalActivities.date, date)
        )
      )
      .orderBy(asc(externalActivities.startedAt)),
    db
      .select({ startedAt: sessions.startedAt, finishedAt: sessions.finishedAt })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNotNull(sessions.startedAt),
          isNotNull(sessions.finishedAt),
          // A day either side catches sessions across midnight in any zone.
          gte(sessions.date, addDays(from, -1)),
          lte(sessions.date, addDays(date, 1))
        )
      ),
  ]);
  const spans = olympus.map((s) => ({ startMs: s.startedAt!.getTime(), endMs: s.finishedAt!.getTime() }));
  const withSpans = rows.map((r) => ({ ...r, startMs: r.startedAt.getTime(), endMs: r.endedAt.getTime() }));
  return outsideSessions(withSpans, spans).map((r) => ({
    date: r.date,
    start: formatTimeInTz(r.startedAt, timezone),
    activityType: r.activityType,
    device: r.device,
    durationMin: r.durationMin,
    distanceKm: r.distanceM != null ? Math.round(r.distanceM / 100) / 10 : null,
    activeKcal: r.activeKcal,
    avgHr: r.avgHr,
    maxHr: r.maxHr,
    hrCoveredMin: r.hrCoveredMin,
  }));
}
