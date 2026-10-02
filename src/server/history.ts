import "server-only";
import { db } from "@/lib/db";
import {
  exercises,
  sessionExercises,
  sessions,
  workingWeightOverrides,
} from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  topSet,
  type DomainExercise,
  type ExerciseSessionLog,
  type SetLogEntry,
} from "@/domain";

type SessionExerciseRow = typeof sessionExercises.$inferSelect;

/** set_details, or uniform sets synthesized from the legacy aggregate columns. */
export function resolveSets(
  se: Pick<SessionExerciseRow, "setDetails" | "sets" | "reps" | "weight" | "rpe">
): SetLogEntry[] {
  if (se.setDetails && se.setDetails.length > 0) return se.setDetails;
  const rpe = se.rpe != null ? parseFloat(se.rpe) : null;
  return Array.from({ length: se.sets }, () => ({
    reps: se.reps,
    weight: parseFloat(se.weight),
    rpe,
    type: "working" as const,
  }));
}

/** Aggregate columns kept in sync for legacy readers (history, progress). */
export function aggregateColumns(sets: SetLogEntry[]) {
  const rpes = sets.map((s) => s.rpe).filter((r): r is number => r != null);
  return {
    sets: Math.max(1, sets.length),
    reps: Math.max(1, ...sets.map((s) => s.reps)),
    weight: Math.max(0, ...sets.map((s) => s.weight)).toFixed(2),
    rpe: rpes.length ? Math.max(...rpes).toFixed(1) : null,
  };
}

/**
 * Per exercise: history newest first (DONE sessions only, optionally
 * excluding one session — the live one).
 */
export async function exerciseHistory(
  userId: string,
  exerciseId: string,
  limit = 10,
  excludeSessionId?: string
): Promise<Array<ExerciseSessionLog & { sessionId: string; notes: string | null }>> {
  const rows = await db
    .select({
      sessionId: sessions.id,
      date: sessions.date,
      sessionType: sessions.sessionType,
      sessionName: sessions.sessionName,
      se: sessionExercises,
    })
    .from(sessionExercises)
    .innerJoin(sessions, eq(sessionExercises.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessionExercises.exerciseId, exerciseId),
        eq(sessions.status, "DONE")
      )
    )
    .orderBy(desc(sessions.date), desc(sessions.createdAt))
    .limit(limit + 1);

  return rows
    .filter((r) => r.sessionId !== excludeSessionId)
    .slice(0, limit)
    .map((r) => ({
      sessionId: r.sessionId,
      date: r.date,
      sessionType: r.sessionType ?? r.sessionName,
      sets: resolveSets(r.se),
      notes: r.se.notes,
    }));
}

/**
 * Working weight per exercise: the latest DONE session's top working set,
 * unless an audited override is newer.
 */
export async function workingWeights(
  userId: string,
  exerciseList: DomainExercise[],
  opts: { exerciseIds?: string[]; excludeSessionId?: string } = {}
): Promise<Map<string, { kg: number; date: string; source: "log" | "override" }>> {
  const byId = new Map(exerciseList.map((e) => [e.id, e]));
  const idFilter = opts.exerciseIds?.length
    ? inArray(sessionExercises.exerciseId, opts.exerciseIds)
    : undefined;

  const [rows, overrides] = await Promise.all([
    db
      .select({
        sessionId: sessions.id,
        date: sessions.date,
        finishedAt: sessions.finishedAt,
        se: sessionExercises,
      })
      .from(sessionExercises)
      .innerJoin(sessions, eq(sessionExercises.sessionId, sessions.id))
      .where(and(eq(sessions.userId, userId), eq(sessions.status, "DONE"), idFilter))
      .orderBy(desc(sessions.date), desc(sessions.createdAt))
      .limit(2000),
    db
      .select()
      .from(workingWeightOverrides)
      .where(
        and(
          eq(workingWeightOverrides.userId, userId),
          opts.exerciseIds?.length
            ? inArray(workingWeightOverrides.exerciseId, opts.exerciseIds)
            : undefined
        )
      )
      .orderBy(desc(workingWeightOverrides.createdAt)),
  ]);

  const out = new Map<string, { kg: number; date: string; source: "log" | "override" }>();
  const logTimes = new Map<string, number>();
  for (const r of rows) {
    if (r.sessionId === opts.excludeSessionId) continue;
    if (out.has(r.se.exerciseId)) continue;
    const ex = byId.get(r.se.exerciseId);
    const top = topSet(ex?.loadMode ?? "TOTAL", resolveSets(r.se));
    if (!top) continue;
    out.set(r.se.exerciseId, { kg: top.weight, date: r.date, source: "log" });
    // When the log happened: its finish time, capped at the end of its date so a
    // back-dated log_session doesn't outrank an override made after that date.
    // Imported/legacy rows have no finish time and fall back to end of day.
    const endOfDay = new Date(`${r.date}T23:59:59Z`).getTime();
    logTimes.set(
      r.se.exerciseId,
      r.finishedAt ? Math.min(r.finishedAt.getTime(), endOfDay) : endOfDay
    );
  }
  const seenOverride = new Set<string>();
  for (const o of overrides) {
    if (seenOverride.has(o.exerciseId)) continue;
    seenOverride.add(o.exerciseId);
    const logged = logTimes.get(o.exerciseId) ?? 0;
    if (o.createdAt.getTime() > logged) {
      out.set(o.exerciseId, {
        kg: parseFloat(o.kg),
        date: o.createdAt.toISOString().slice(0, 10),
        source: "override",
      });
    }
  }
  return out;
}

export async function lastTopSetKg(
  userId: string,
  exerciseList: DomainExercise[],
  exerciseIds?: string[],
  excludeSessionId?: string
): Promise<Map<string, number>> {
  const ww = await workingWeights(userId, exerciseList, { exerciseIds, excludeSessionId });
  return new Map(Array.from(ww.entries()).map(([k, v]) => [k, v.kg]));
}

export async function exerciseNamesById(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(inArray(exercises.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}
