import "server-only";
import { and, eq, gte, inArray, isNotNull, lte, min } from "drizzle-orm";
import { db } from "@/lib/db";
import { externalActivities, sessionExercises, sessions } from "@/lib/db/schema";
import { addDays } from "@/lib/dates";
import { hrBasis, sessionRpe, trainingLoad, type LoadItem, type TrainingLoad } from "@/domain";
import { listCheckIns } from "./checkins";
import { listActivities } from "./external-activities";

/** Longer than this and the session was left open; its minutes mean nothing. */
const MAX_SESSION_MIN = 4 * 60;

/** Load over the 28 days ending `date`: Olympus sessions plus outside activities. */
export async function getTrainingLoad(userId: string, date: string): Promise<TrainingLoad> {
  const from = addDays(date, -27);
  const [done, activities, checkIns, maxHrs, firsts] = await Promise.all([
    db
      .select({ id: sessions.id, date: sessions.date, startedAt: sessions.startedAt, finishedAt: sessions.finishedAt, heartRate: sessions.heartRate })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.status, "DONE"), gte(sessions.date, from), lte(sessions.date, date))),
    listActivities(userId, date, 28),
    listCheckIns(userId, date, 28),
    observedMaxHrs(userId),
    Promise.all([
      db.select({ d: min(sessions.date) }).from(sessions).where(eq(sessions.userId, userId)),
      db.select({ d: min(externalActivities.date) }).from(externalActivities).where(eq(externalActivities.userId, userId)),
    ]),
  ]);

  const rows = done.length
    ? await db
        .select({ sessionId: sessionExercises.sessionId, setDetails: sessionExercises.setDetails, rpe: sessionExercises.rpe })
        .from(sessionExercises)
        .where(inArray(sessionExercises.sessionId, done.map((s) => s.id)))
    : [];

  const items: LoadItem[] = done.map((s) => {
    // Rows logged before per-set details carry one RPE for the exercise.
    const sets = rows
      .filter((r) => r.sessionId === s.id)
      .flatMap((r) => r.setDetails ?? (r.rpe != null ? [{ reps: 0, weight: 0, rpe: Number(r.rpe) }] : []));
    const minutes =
      s.startedAt && s.finishedAt ? Math.round((s.finishedAt.getTime() - s.startedAt.getTime()) / 60_000) : null;
    return {
      date: s.date,
      kind: "olympus",
      durationMin: minutes != null && minutes > 0 && minutes <= MAX_SESSION_MIN ? minutes : null,
      rpe: sessionRpe(sets),
      avgHr: s.heartRate?.avgHr ?? null,
      hrCoveredMin: s.heartRate?.coveredMin ?? null,
    };
  });
  for (const a of activities) {
    items.push({ date: a.date, kind: "outside", durationMin: a.durationMin, rpe: null, avgHr: a.avgHr, hrCoveredMin: a.hrCoveredMin });
  }

  const resting = checkIns.flatMap((c) => (c.restingHr != null ? [c.restingHr] : []));
  const firstDate = firsts.flatMap(([r]) => (r?.d ? [r.d] : [])).sort()[0] ?? null;
  return trainingLoad(items, date, hrBasis(resting, maxHrs), firstDate);
}

/** Peak HR from every stored session and activity in the last half year. */
async function observedMaxHrs(userId: string): Promise<number[]> {
  const since = new Date(Date.now() - 182 * 86_400_000);
  const [s, a] = await Promise.all([
    db
      .select({ hr: sessions.heartRate })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNotNull(sessions.heartRate), gte(sessions.finishedAt, since))),
    db
      .select({ hr: externalActivities.maxHr })
      .from(externalActivities)
      .where(and(eq(externalActivities.userId, userId), isNotNull(externalActivities.maxHr), gte(externalActivities.startedAt, since))),
  ]);
  return [...s.flatMap((r) => (r.hr ? [r.hr.maxHr] : [])), ...a.flatMap((r) => (r.hr != null ? [r.hr] : []))];
}
