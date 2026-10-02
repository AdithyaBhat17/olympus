import "server-only";
import { db } from "@/lib/db";
import { planItems, sessionExercises, sessions } from "@/lib/db/schema";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { todayInTz } from "@/lib/dates";
import {
  blockedReason,
  flagsForSet,
  formatSleep,
  renderSessionMarkdown,
  sessionCatches,
  sessionFileName,
  trueKg,
  underloadNudge,
  type DomainExercise,
  type ExportSession,
  type PlanSet,
  type SessionCatch,
  type SetLogEntry,
  type UnderloadNudge,
} from "@/domain";
import { getConstraints, listExerciseRows, resolveRef, toDomainExercise } from "./exercises";
import { aggregateColumns, exerciseHistory, resolveSets, workingWeights } from "./history";
import { getCheckIn } from "./checkins";
import { flagsFor, listOpenFlags } from "./flags";
import { getPlan, setPlanStatus } from "./plans";

type SessionRow = typeof sessions.$inferSelect;
type SessionExerciseRow = typeof sessionExercises.$inferSelect;

export class DomainError extends Error {}

// ---------------------------------------------------------------------------
// View models (serializable — passed straight to client components)
// ---------------------------------------------------------------------------

export interface ExerciseMeta {
  id: string;
  slug: string | null;
  name: string;
  category: string;
  loadMode: DomainExercise["loadMode"];
  carriageKgPerSide: number | null;
  isCompound: boolean;
  bodyRegion: "upper" | "lower" | null;
  formCueId: string | null;
}

export interface LiveSetView {
  index: number;
  planned: PlanSet | null;
  logged: SetLogEntry | null;
  /** Same set index from the previous session of this exercise ("Last"). */
  last: { weight: number; reps: number } | null;
}

export interface LiveItemView {
  key: string;
  planItemId: string | null;
  exercise: ExerciseMeta;
  plannedExercise: ExerciseMeta | null;
  swapped: boolean;
  restSec: number;
  straps: boolean;
  cues: string[];
  pairGroup: string | null;
  sets: LiveSetView[];
  lastTopKg: number | null;
  done: boolean;
  coachFlags: string[];
  blockedReason: string | null;
}

export interface SessionView {
  id: string;
  date: string;
  status: SessionRow["status"];
  sessionType: string | null;
  title: string;
  notes: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  sentAt: string | null;
  plan: {
    id: string;
    source: "claude" | "manual";
    pushedAt: string;
    coachNotes: string | null;
    warnings: string[];
  } | null;
  items: LiveItemView[];
  progressionOnHold: boolean;
  checkIn: { sleepMin: number | null; proteinG: number | null; waterMl: number | null } | null;
}

function meta(row: ReturnType<typeof toDomainExercise> & { formCueId?: string | null }): ExerciseMeta {
  return {
    id: row.id,
    slug: row.slug ?? null,
    name: row.name,
    category: row.category,
    loadMode: row.loadMode,
    carriageKgPerSide: row.carriageKgPerSide,
    isCompound: row.isCompound,
    bodyRegion: row.bodyRegion,
    formCueId: row.formCueId ?? null,
  };
}

async function exerciseIndex(userId: string) {
  const rows = await listExerciseRows(userId);
  const domain = rows.map((r) => ({ ...toDomainExercise(r), formCueId: r.formCueId }));
  return { domain, byId: new Map(domain.map((e) => [e.id, e])) };
}

async function ownedSession(userId: string, sessionId: string): Promise<SessionRow> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  if (!row) throw new DomainError("Session not found");
  return row;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getLiveSession(userId: string): Promise<SessionRow | null> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.status, "IN_PROGRESS")))
    .orderBy(desc(sessions.startedAt))
    .limit(1);
  return row ?? null;
}

export async function getSessionView(userId: string, sessionId: string): Promise<SessionView> {
  const session = await ownedSession(userId, sessionId);
  const [{ domain, byId }, cons, logged, plan, openFlags, checkIn] = await Promise.all([
    exerciseIndex(userId),
    getConstraints(userId),
    db
      .select()
      .from(sessionExercises)
      .where(eq(sessionExercises.sessionId, sessionId))
      .orderBy(asc(sessionExercises.orderIndex)),
    session.planId ? getPlan(userId, session.planId) : Promise.resolve(null),
    listOpenFlags(userId),
    getCheckIn(userId, session.date),
  ]);

  const swaps = session.swaps ?? {};
  const actualIds = new Set<string>();
  plan?.items.forEach((it) => actualIds.add(swaps[it.id]?.exerciseId ?? it.exerciseId));
  logged.forEach((se) => actualIds.add(se.exerciseId));
  const ids = Array.from(actualIds);

  const [tops, lastSets] = await Promise.all([
    workingWeights(userId, domain, { exerciseIds: ids, excludeSessionId: sessionId }),
    Promise.all(
      ids.map(async (id) => [id, (await exerciseHistory(userId, id, 1, sessionId))[0]?.sets ?? []] as const)
    ).then((pairs) => new Map(pairs)),
  ]);

  const findLogged = (planItemId: string | null, exerciseId: string) =>
    logged.find((se) =>
      planItemId ? se.planItemId === planItemId : !se.planItemId && se.exerciseId === exerciseId
    );

  const buildItem = (
    key: string,
    planItemId: string | null,
    exId: string,
    plannedExId: string | null,
    planned: PlanSet[],
    extra: Partial<LiveItemView>,
    row: SessionExerciseRow | undefined
  ): LiveItemView | null => {
    const ex = byId.get(exId);
    if (!ex) return null;
    const done = row ? resolveSets(row) : [];
    const prev = lastSets.get(exId) ?? [];
    const count = Math.max(planned.length, done.length, 1);
    const sets: LiveSetView[] = Array.from({ length: count }, (_, i) => ({
      index: i,
      planned: planned[i] ?? null,
      logged: done[i] ?? null,
      last: prev[i] ? { weight: prev[i].weight, reps: prev[i].reps } : null,
    }));
    const plannedEx = plannedExId ? byId.get(plannedExId) : null;
    return {
      key,
      planItemId,
      exercise: meta(ex),
      plannedExercise: plannedEx ? meta(plannedEx) : null,
      swapped: !!plannedExId && plannedExId !== exId,
      restSec: 120,
      straps: false,
      cues: [],
      pairGroup: null,
      sets,
      lastTopKg: tops.get(exId)?.kg ?? null,
      done: planned.length > 0 ? done.length >= planned.length : done.length > 0,
      coachFlags: flagsFor(openFlags, { exerciseId: exId }).filter((f) => f.scope === "exerciseId").map((f) => f.text),
      blockedReason: blockedReason(ex, cons),
      ...extra,
    };
  };

  const items: LiveItemView[] = [];
  for (const it of plan?.items ?? []) {
    const actual = swaps[it.id]?.exerciseId ?? it.exerciseId;
    const v = buildItem(
      it.id,
      it.id,
      actual,
      it.exerciseId,
      it.sets,
      { restSec: it.restSec, straps: it.straps, cues: it.cues, pairGroup: it.pairGroup },
      findLogged(it.id, actual)
    );
    if (v) items.push(v);
  }
  for (const se of logged) {
    if (se.planItemId && plan?.items.some((it) => it.id === se.planItemId)) continue;
    const v = buildItem(`x-${se.id}`, null, se.exerciseId, null, [], {
      restSec: byId.get(se.exerciseId)?.isCompound ? 180 : 90,
    }, se);
    if (v) items.push(v);
  }

  const gate = (plan?.recoveryGate?.minSleepH ?? 6) * 60;
  return {
    id: session.id,
    date: session.date,
    status: session.status,
    sessionType: session.sessionType,
    title: plan?.title ?? session.sessionName.replace(/^Session \S+ · /, ""),
    notes: session.notes,
    startedAt: session.startedAt?.toISOString() ?? null,
    finishedAt: session.finishedAt?.toISOString() ?? null,
    sentAt: session.sentAt?.toISOString() ?? null,
    plan: plan
      ? {
          id: plan.id,
          source: plan.source,
          pushedAt: plan.pushedAt.toISOString(),
          coachNotes: plan.coachNotes,
          warnings: plan.warnings,
        }
      : null,
    items,
    progressionOnHold: checkIn?.sleepMin != null && checkIn.sleepMin < gate,
    checkIn: checkIn
      ? { sleepMin: checkIn.sleepMin, proteinG: checkIn.proteinG, waterMl: checkIn.waterMl }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Live-session mutations
// ---------------------------------------------------------------------------

export async function startSession(
  userId: string,
  planId: string
): Promise<string> {
  const live = await getLiveSession(userId);
  if (live) return live.id;

  const plan = await getPlan(userId, planId);
  if (!plan) throw new DomainError("Plan not found");
  if (plan.status !== "READY" && plan.status !== "IN_PROGRESS") {
    throw new DomainError(`Plan is ${plan.status}`);
  }

  const [prev] = await db
    .select({ weekNumber: sessions.weekNumber, blockNumber: sessions.blockNumber })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.date), desc(sessions.createdAt))
    .limit(1);

  const [row] = await db
    .insert(sessions)
    .values({
      userId,
      date: todayInTz(),
      sessionName: `Session ${plan.sessionType} · ${plan.title}`,
      weekNumber: prev?.weekNumber ?? 1,
      blockNumber: prev?.blockNumber ?? "1",
      planId: plan.id,
      sessionType: plan.sessionType,
      status: "IN_PROGRESS",
      startedAt: new Date(),
    })
    .returning({ id: sessions.id });
  await setPlanStatus(userId, plan.id, "IN_PROGRESS");
  return row.id;
}

export interface LogSetInput {
  exerciseId: string;
  planItemId?: string | null;
  setIndex: number;
  /** For PER_SIDE machines: what's on the pin/horn. True load is computed. */
  platesKg?: number | null;
  /** True kg when not entering plates. */
  weight?: number | null;
  reps: number;
  rpe?: number | null;
  type?: "warmup" | "working";
  blockedOverride?: boolean;
}

export interface LogSetResult {
  set: SetLogEntry;
  nudge: UnderloadNudge | null;
}

export async function logSet(
  userId: string,
  sessionId: string,
  input: LogSetInput
): Promise<LogSetResult> {
  const session = await ownedSession(userId, sessionId);
  if (session.status !== "IN_PROGRESS") throw new DomainError("Session is already finished");

  const { domain, byId } = await exerciseIndex(userId);
  const ex = byId.get(input.exerciseId);
  if (!ex) throw new DomainError("Unknown exercise");
  if (!Number.isFinite(input.reps) || input.reps < 0 || input.reps > 1000) {
    throw new DomainError("Invalid reps");
  }

  const weight =
    input.platesKg != null ? trueKg(ex, input.platesKg) : input.weight ?? null;
  if (weight == null || !Number.isFinite(weight) || weight < 0 || weight > 9999) {
    throw new DomainError("Invalid weight");
  }

  const tops = await workingWeights(userId, domain, {
    exerciseIds: [ex.id],
    excludeSessionId: sessionId,
  });
  const lastTop = tops.get(ex.id)?.kg ?? null;

  const cons = await getConstraints(userId);
  const isBlocked = blockedReason(ex, cons) != null;

  const entry: SetLogEntry = {
    reps: Math.round(input.reps),
    weight,
    platesKg: input.platesKg ?? null,
    rpe: input.rpe ?? null,
    type: input.type ?? "working",
    flags: flagsForSet(ex, { weight, type: input.type ?? "working" }, lastTop, {
      blockedOverride: isBlocked && !!input.blockedOverride,
    }),
    doneAt: new Date().toISOString(),
  };

  const planItemId = input.planItemId ?? null;
  const rows = await db
    .select()
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, sessionId));
  const existing = rows.find((se) =>
    planItemId ? se.planItemId === planItemId && se.exerciseId === ex.id : !se.planItemId && se.exerciseId === ex.id
  );

  const sets = existing ? [...resolveSets(existing)] : [];
  const idx = Math.min(Math.max(0, input.setIndex), sets.length);

  const [pi] = planItemId
    ? await db.select().from(planItems).where(eq(planItems.id, planItemId))
    : [];
  const planned: PlanSet | null =
    pi?.sets[idx] ?? pi?.sets.find((s) => s.type === "working") ?? null;
  const nudge =
    entry.type === "working" ? underloadNudge(ex, entry, planned, lastTop) : null;
  // A set the app nudged as a warm-up is an underload even inside the 15% band,
  // so the export and "What the app caught" match what the athlete saw.
  if (nudge && !entry.flags?.includes("underloaded")) {
    entry.flags = [...(entry.flags ?? []), "underloaded"];
  }
  sets[idx] = entry;

  if (existing) {
    await db
      .update(sessionExercises)
      .set({ setDetails: sets, ...aggregateColumns(sets) })
      .where(eq(sessionExercises.id, existing.id));
  } else {
    await db.insert(sessionExercises).values({
      sessionId,
      exerciseId: ex.id,
      planItemId,
      setDetails: sets,
      orderIndex: pi?.orderIndex ?? rows.length,
      notes: null,
      ...aggregateColumns(sets),
    });
  }

  return { set: entry, nudge };
}

export async function removeSet(
  userId: string,
  sessionId: string,
  input: { exerciseId: string; planItemId?: string | null; setIndex: number }
): Promise<void> {
  const session = await ownedSession(userId, sessionId);
  if (session.status !== "IN_PROGRESS") throw new DomainError("Session is already finished");
  const rows = await db
    .select()
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, sessionId));
  const row = rows.find((se) =>
    input.planItemId
      ? se.planItemId === input.planItemId && se.exerciseId === input.exerciseId
      : !se.planItemId && se.exerciseId === input.exerciseId
  );
  if (!row) return;
  const sets = resolveSets(row).filter((_, i) => i !== input.setIndex);
  if (sets.length === 0) {
    await db.delete(sessionExercises).where(eq(sessionExercises.id, row.id));
  } else {
    await db
      .update(sessionExercises)
      .set({ setDetails: sets, ...aggregateColumns(sets) })
      .where(eq(sessionExercises.id, row.id));
  }
}

/** Swap a planned exercise for another. Blocked swaps need an explicit override. */
export async function swapExercise(
  userId: string,
  sessionId: string,
  input: { planItemId: string; exerciseRef: string; overrideReason?: string | null }
): Promise<void> {
  const session = await ownedSession(userId, sessionId);
  if (session.status !== "IN_PROGRESS") throw new DomainError("Session is already finished");
  const { domain } = await exerciseIndex(userId);
  const ex = resolveRef(domain, input.exerciseRef);
  if (!ex) throw new DomainError("Unknown exercise");
  const reason = blockedReason(ex, await getConstraints(userId));
  if (reason && !input.overrideReason?.trim()) {
    throw new DomainError(`${ex.name} is blocked: ${reason}`);
  }
  const swaps = { ...(session.swaps ?? {}) };
  swaps[input.planItemId] = { exerciseId: ex.id, reason: input.overrideReason ?? null };
  await db.update(sessions).set({ swaps }).where(eq(sessions.id, sessionId));
}

export async function finishSession(
  userId: string,
  sessionId: string,
  notes: string | null
): Promise<void> {
  const session = await ownedSession(userId, sessionId);
  const count = await db
    .select({ id: sessionExercises.id })
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, sessionId));
  if (count.length === 0) throw new DomainError("Log at least one set before finishing");
  await db
    .update(sessions)
    .set({
      status: "DONE",
      notes: notes?.trim() || null,
      finishedAt: session.finishedAt ?? new Date(),
    })
    .where(eq(sessions.id, sessionId));
  if (session.planId) await setPlanStatus(userId, session.planId, "DONE");
}

export async function saveSessionNotes(userId: string, sessionId: string, notes: string | null) {
  await ownedSession(userId, sessionId);
  await db
    .update(sessions)
    .set({ notes: notes?.trim() || null })
    .where(eq(sessions.id, sessionId));
}

/** "Send to PT": marks DONE and stamps sentAt so get_sessions surfaces it. */
export async function sendToPT(userId: string, sessionId: string, notes?: string | null) {
  const session = await ownedSession(userId, sessionId);
  if (session.status === "IN_PROGRESS") {
    await finishSession(userId, sessionId, notes ?? session.notes);
  } else if (notes !== undefined) {
    await saveSessionNotes(userId, sessionId, notes);
  }
  await db.update(sessions).set({ sentAt: new Date() }).where(eq(sessions.id, sessionId));
}

/** Throw away a live session that never got going; the plan goes back to READY. */
export async function discardSession(userId: string, sessionId: string) {
  const session = await ownedSession(userId, sessionId);
  if (session.status !== "IN_PROGRESS") throw new DomainError("Only a live session can be discarded");
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  if (session.planId) await setPlanStatus(userId, session.planId, "READY");
}

// ---------------------------------------------------------------------------
// Finish screen + exports
// ---------------------------------------------------------------------------

export async function sessionExport(
  userId: string,
  sessionId: string
): Promise<{ fileName: string; markdown: string; export: ExportSession; catches: SessionCatch[] }> {
  const view = await getSessionView(userId, sessionId);
  const exp: ExportSession = {
    date: view.date,
    sessionType: view.sessionType,
    title: view.title,
    notes: view.notes,
    checkIn: view.checkIn,
    exercises: view.items
      .filter((i) => i.sets.some((s) => s.logged))
      .map((i) => ({
        name: i.exercise.name,
        loadMode: i.exercise.loadMode,
        straps: i.straps,
        sets: i.sets.map((s) => s.logged).filter((s): s is SetLogEntry => !!s),
      })),
  };
  const catches = sessionCatches(
    view.items.map((i) => ({
      ex: { name: i.exercise.name, loadMode: i.exercise.loadMode },
      sets: i.sets.map((s) => s.logged).filter((s): s is SetLogEntry => !!s),
      lastTopKg: i.lastTopKg,
    }))
  );
  if (view.progressionOnHold && view.checkIn?.sleepMin != null) {
    catches.push({
      kind: "recovery",
      text: `Sleep ${formatSleep(view.checkIn.sleepMin)} — progression held.`,
    });
  }
  return {
    fileName: sessionFileName(exp),
    markdown: renderSessionMarkdown(exp),
    export: exp,
    catches,
  };
}

// ---------------------------------------------------------------------------
// MCP-facing: planned vs actual, and logging whole sessions from chat
// ---------------------------------------------------------------------------

export interface SessionFilters {
  from?: string;
  to?: string;
  sessionType?: string;
  exerciseId?: string;
  limit?: number;
  includeInProgress?: boolean;
}

export async function getSessionsDetailed(userId: string, f: SessionFilters) {
  const { domain } = await exerciseIndex(userId);
  const exId = f.exerciseId ? resolveRef(domain, f.exerciseId)?.id : undefined;
  if (f.exerciseId && !exId) throw new DomainError(`Unknown exercise "${f.exerciseId}"`);

  let sessionIdFilter: string[] | undefined;
  if (exId) {
    const rows = await db
      .selectDistinct({ id: sessionExercises.sessionId })
      .from(sessionExercises)
      .where(eq(sessionExercises.exerciseId, exId));
    sessionIdFilter = rows.map((r) => r.id);
    if (sessionIdFilter.length === 0) return [];
  }

  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        f.from ? gte(sessions.date, f.from) : undefined,
        f.to ? lte(sessions.date, f.to) : undefined,
        f.sessionType ? eq(sessions.sessionType, f.sessionType) : undefined,
        f.includeInProgress ? undefined : eq(sessions.status, "DONE"),
        sessionIdFilter ? inArray(sessions.id, sessionIdFilter) : undefined
      )
    )
    .orderBy(desc(sessions.date), desc(sessions.createdAt))
    .limit(Math.min(f.limit ?? 5, 30));

  return Promise.all(
    rows.map(async (s) => {
      const v = await getSessionView(userId, s.id);
      const items = v.items
        .filter((i) => !exId || i.exercise.id === exId)
        .map((i) => ({
          exercise: i.exercise.name,
          exerciseId: i.exercise.slug ?? i.exercise.id,
          plannedExercise: i.swapped ? i.plannedExercise?.name ?? null : undefined,
          loadMode: i.exercise.loadMode,
          lastTopKgBefore: i.lastTopKg,
          sets: i.sets.map((st) => ({
            set: st.index + 1,
            planned: st.planned
              ? { type: st.planned.type, reps: st.planned.reps, rpe: st.planned.rpe ?? null, openKg: st.planned.openKg ?? null }
              : null,
            actual: st.logged
              ? {
                  kg: st.logged.weight,
                  platesKg: st.logged.platesKg ?? null,
                  reps: st.logged.reps,
                  rpe: st.logged.rpe ?? null,
                  type: st.logged.type ?? "working",
                  flags: st.logged.flags ?? [],
                }
              : null,
          })),
        }));
      return {
        sessionId: s.id,
        date: s.date,
        sessionType: s.sessionType,
        title: v.title,
        status: s.status,
        source: v.plan?.source ?? "manual",
        sentToPT: s.sentAt?.toISOString() ?? null,
        durationMin:
          s.startedAt && s.finishedAt
            ? Math.round((s.finishedAt.getTime() - s.startedAt.getTime()) / 60000)
            : null,
        notes: s.notes,
        checkIn: v.checkIn,
        items,
      };
    })
  );
}

export interface LogSessionPayload {
  date: string;
  sessionType?: string | null;
  title: string;
  notes?: string | null;
  exercises: Array<{
    exerciseId: string;
    notes?: string | null;
    sets: Array<{
      kg?: number | null;
      platesKg?: number | null;
      reps: number;
      rpe?: number | null;
      type?: "warmup" | "working";
    }>;
  }>;
}

/** Whole session rebuilt from chat (Garmin/Strava notes). Same maths as the app. */
export async function logSessionFull(userId: string, p: LogSessionPayload) {
  const { domain, byId } = await exerciseIndex(userId);
  const cons = await getConstraints(userId);
  const resolved = p.exercises.map((e) => ({ e, ex: resolveRef(domain, e.exerciseId) }));
  const unknown = resolved.filter((r) => !r.ex).map((r) => r.e.exerciseId);
  if (unknown.length) throw new DomainError(`Unknown exercise(s): ${unknown.join(", ")}`);

  const ids = resolved.map((r) => r.ex!.id);
  const tops = await workingWeights(userId, domain, { exerciseIds: ids });

  const [prev] = await db
    .select({ weekNumber: sessions.weekNumber, blockNumber: sessions.blockNumber })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.date))
    .limit(1);

  const [s] = await db
    .insert(sessions)
    .values({
      userId,
      date: p.date,
      sessionName: p.sessionType ? `Session ${p.sessionType} · ${p.title}` : p.title,
      sessionType: p.sessionType ?? null,
      weekNumber: prev?.weekNumber ?? 1,
      blockNumber: prev?.blockNumber ?? "1",
      notes: p.notes ?? null,
      status: "DONE",
      finishedAt: new Date(),
    })
    .returning({ id: sessions.id });

  const flagged: string[] = [];
  const rows = resolved.map(({ e, ex }, i) => {
    const d = byId.get(ex!.id)!;
    const lastTop = tops.get(d.id)?.kg ?? null;
    const blocked = blockedReason(d, cons) != null;
    const sets: SetLogEntry[] = e.sets.map((st) => {
      const weight = st.platesKg != null ? trueKg(d, st.platesKg) : st.kg ?? 0;
      const type = st.type ?? "working";
      return {
        reps: st.reps,
        weight,
        platesKg: st.platesKg ?? null,
        rpe: st.rpe ?? null,
        type,
        flags: flagsForSet(d, { weight, type }, lastTop, { blockedOverride: blocked }),
      };
    });
    if (blocked) flagged.push(`${d.name} is blocked — logged with a blocked_override flag`);
    return {
      sessionId: s.id,
      exerciseId: d.id,
      orderIndex: i,
      notes: e.notes ?? null,
      setDetails: sets,
      ...aggregateColumns(sets),
    };
  });
  if (rows.length) await db.insert(sessionExercises).values(rows);
  return { sessionId: s.id, warnings: flagged };
}

/** All DONE sessions as ExportSessions, newest first (for latest.md). */
export async function exportSessions(userId: string, opts: { date?: string; limit?: number } = {}) {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessions.status, "DONE"),
        opts.date ? eq(sessions.date, opts.date) : undefined
      )
    )
    .orderBy(desc(sessions.date), desc(sessions.createdAt))
    .limit(opts.limit ?? 200);
  const out: ExportSession[] = [];
  for (const r of rows) out.push((await sessionExport(userId, r.id)).export);
  return out;
}

/** Recent rotation types, newest first. */
export async function recentSessionTypes(userId: string, limit = 10): Promise<string[]> {
  const rows = await db
    .select({ t: sessions.sessionType })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.status, "DONE")))
    .orderBy(desc(sessions.date), desc(sessions.createdAt))
    .limit(limit);
  return rows.map((r) => r.t).filter((t): t is string => !!t);
}

