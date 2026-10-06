import "server-only";
import { DomainError } from "./errors";
import { db } from "@/lib/db";
import { dailyCheckIns, planItems, plans, sessionExercises, sessions } from "@/lib/db/schema";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { adhocItemKey } from "@/lib/utils";
import {
  DEFAULT_REST_SEC,
  blockedReason,
  annotateSets,
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
  type Targets,
  type UnderloadNudge,
} from "@/domain";
import {
  exerciseRef,
  getConstraints,
  listExerciseRows,
  resolveRef,
  toDomainExercise,
} from "./exercises";
import { aggregateColumns, previousSessions, resolveSets, workingWeights } from "./history";
import { getCheckIn } from "./checkins";
import { flagsFor, listOpenFlags } from "./flags";
import { getPlan, setPlanStatus } from "./plans";
import { getProfile, todayFor } from "./profile";

type SessionRow = typeof sessions.$inferSelect;
type SessionExerciseRow = typeof sessionExercises.$inferSelect;

export { DomainError };

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
  /** "barbell", "machine"… — decides whether the lifting screen draws plates. */
  equipment: string | null;
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
  /** Per-exercise note on the logged row (log_session, imported history). */
  notes: string | null;
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
  targets: Pick<Targets, "proteinG" | "waterMl">;
}

function exerciseMeta(row: ReturnType<typeof toDomainExercise> & { formCueId?: string | null }): ExerciseMeta {
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
    equipment: row.equipment ?? null,
  };
}

export async function exerciseIndex(userId: string) {
  const rows = await listExerciseRows(userId);
  const domain = rows.map((r) => ({ ...toDomainExercise(r), formCueId: r.formCueId }));
  return { domain, byId: new Map(domain.map((e) => [e.id, e])) };
}

type PlanItemRow = typeof planItems.$inferSelect;

interface AssembledItem {
  key: string;
  planItemId: string | null;
  exerciseId: string;
  plannedExerciseId: string | null;
  planItem: PlanItemRow | null;
  row: SessionExerciseRow | undefined;
}

/**
 * Plan items in plan order (swaps applied), each with the row logged for its
 * current exercise; then every other logged row — unplanned additions and
 * sets logged before a swap — so no logged set is ever dropped.
 */
function assembleItems(
  plan: { items: PlanItemRow[] } | null,
  swaps: Record<string, { exerciseId: string }>,
  logged: SessionExerciseRow[]
): AssembledItem[] {
  const out: AssembledItem[] = [];
  const used = new Set<string>();
  const planItemIds = new Set((plan?.items ?? []).map((it) => it.id));
  for (const it of plan?.items ?? []) {
    const actual = swaps[it.id]?.exerciseId ?? it.exerciseId;
    const row = logged.find((se) => se.planItemId === it.id && se.exerciseId === actual);
    if (row) used.add(row.id);
    out.push({
      key: it.id,
      planItemId: it.id,
      exerciseId: actual,
      plannedExerciseId: it.exerciseId,
      planItem: it,
      row,
    });
  }
  const adhoc = new Set<string>();
  for (const se of logged) {
    if (used.has(se.id)) continue;
    // logSet keeps one unplanned row per exercise; imported sessions can repeat one.
    const key = !se.planItemId && !adhoc.has(se.exerciseId) ? adhocItemKey(se.exerciseId) : `x-${se.id}`;
    if (!se.planItemId) adhoc.add(se.exerciseId);
    out.push({
      key,
      // Keep the plan item id when it's this plan's, so logSet/removeSet find the row.
      planItemId: se.planItemId && planItemIds.has(se.planItemId) ? se.planItemId : null,
      exerciseId: se.exerciseId,
      plannedExerciseId: null,
      planItem: null,
      row: se,
    });
  }
  return out;
}

function sessionTitle(session: SessionRow, plan: { title: string } | null): string {
  return plan?.title ?? session.sessionName.replace(/^Session \S+ · /, "");
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
  const [{ domain, byId }, cons, logged, plan, openFlags, checkIn, profile] = await Promise.all([
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
    getProfile(userId),
  ]);

  const swaps = session.swaps ?? {};
  const actualIds = new Set<string>();
  plan?.items.forEach((it) => actualIds.add(swaps[it.id]?.exerciseId ?? it.exerciseId));
  logged.forEach((se) => actualIds.add(se.exerciseId));
  const ids = Array.from(actualIds);

  // "Last" and "last top" mean the session before this one — not the latest
  // other session, which for an old session would be a later one.
  const [prevs, live] = await Promise.all([
    previousSessions(userId, domain, ids, {
      date: session.date,
      createdAt: session.createdAt,
      excludeSessionId: sessionId,
    }),
    // While training, the reference also honours working-weight overrides.
    session.status === "IN_PROGRESS"
      ? workingWeights(userId, domain, { exerciseIds: ids, excludeSessionId: sessionId })
      : Promise.resolve(null),
  ]);

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
    const prev = prevs.get(exId)?.sets ?? [];
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
      exercise: exerciseMeta(ex),
      plannedExercise: plannedEx ? exerciseMeta(plannedEx) : null,
      swapped: !!plannedExId && plannedExId !== exId,
      restSec: 120,
      straps: false,
      cues: [],
      pairGroup: null,
      sets,
      notes: row?.notes ?? null,
      lastTopKg: live ? live.get(exId)?.kg ?? null : prevs.get(exId)?.topKg ?? null,
      done: planned.length > 0 ? done.length >= planned.length : done.length > 0,
      coachFlags: flagsFor(openFlags, { exerciseId: exId }).filter((f) => f.scope === "exerciseId").map((f) => f.text),
      blockedReason: blockedReason(ex, cons),
      ...extra,
    };
  };

  const items: LiveItemView[] = [];
  for (const a of assembleItems(plan, swaps, logged)) {
    const it = a.planItem;
    const v = buildItem(
      a.key,
      a.planItemId,
      a.exerciseId,
      a.plannedExerciseId,
      it?.sets ?? [],
      it
        ? { restSec: it.restSec, straps: it.straps, cues: it.cues, pairGroup: it.pairGroup }
        : { restSec: byId.get(a.exerciseId)?.isCompound ? DEFAULT_REST_SEC.compound : DEFAULT_REST_SEC.accessory },
      a.row
    );
    if (v) items.push(v);
  }

  const gate = plan?.recoveryGate ? plan.recoveryGate.minSleepH * 60 : profile.targets.minSleepMin;
  return {
    id: session.id,
    date: session.date,
    status: session.status,
    sessionType: session.sessionType,
    title: sessionTitle(session, plan),
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
    targets: { proteinG: profile.targets.proteinG, waterMl: profile.targets.waterMl },
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
      date: await todayFor(userId),
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

  // Two concurrent starts (double tap, prefetch + navigation) can both miss
  // getLiveSession and insert. Every racer agrees on the earliest live row;
  // the others drop their own insert and resume that one.
  const [winner] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.status, "IN_PROGRESS")))
    .orderBy(asc(sessions.startedAt), asc(sessions.id))
    .limit(1);
  if (winner && winner.id !== row.id) {
    await db.delete(sessions).where(eq(sessions.id, row.id));
    return winner.id;
  }
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
    flags: isBlocked && input.blockedOverride ? ["blocked_override"] : [],
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

  // The plan item must belong to this session's own plan.
  const [pi] =
    planItemId && session.planId
      ? await db
          .select()
          .from(planItems)
          .where(and(eq(planItems.id, planItemId), eq(planItems.planId, session.planId)))
      : [];
  if (planItemId && !pi) throw new DomainError("Plan item isn't part of this session");
  const planned: PlanSet | null =
    pi?.sets[idx] ?? pi?.sets.find((s) => s.type === "working") ?? null;
  const nudge =
    entry.type === "working" ? underloadNudge(ex, entry, planned, lastTop) : null;
  // A set the app nudged as a warm-up is an underload even inside the 15% band,
  // so the export and "What the app caught" match what the athlete saw.
  if (nudge) entry.flags = [...(entry.flags ?? []), "underloaded"];
  sets[idx] = entry;
  // Re-flag the whole exercise: an opener only reads as underloaded once the
  // heavier sets land. Nudged sets keep their flag.
  const annotated = annotateSets(ex, sets, lastTop, { keep: ["underloaded"] });
  sets.splice(0, sets.length, ...annotated);

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

  return { set: sets[idx], nudge };
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
  if (!session.planId) return;
  // Sweep up empty duplicates of this plan's live session (left by a start
  // race) so Today doesn't show one still ticking after a discard.
  const twins = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(eq(sessions.userId, userId), eq(sessions.planId, session.planId), eq(sessions.status, "IN_PROGRESS"))
    );
  if (twins.length) {
    const logged = await db
      .selectDistinct({ sessionId: sessionExercises.sessionId })
      .from(sessionExercises)
      .where(inArray(sessionExercises.sessionId, twins.map((t) => t.id)));
    const keep = new Set(logged.map((l) => l.sessionId));
    const empty = twins.filter((t) => !keep.has(t.id)).map((t) => t.id);
    if (empty.length) await db.delete(sessions).where(inArray(sessions.id, empty));
    if (keep.size) return;
  }
  await setPlanStatus(userId, session.planId, "READY");
}

// ---------------------------------------------------------------------------
// Finish screen + exports
// ---------------------------------------------------------------------------

/** Finish-screen export, built from a view the caller already loaded. */
export function sessionExport(
  view: SessionView
): { fileName: string; markdown: string; export: ExportSession; catches: SessionCatch[] } {
  const exp: ExportSession = {
    date: view.date,
    sessionType: view.sessionType,
    title: view.title,
    notes: view.notes,
    checkIn: view.checkIn,
    targets: view.targets,
    exercises: view.items
      .filter((i) => i.sets.some((s) => s.logged))
      .map((i) => ({
        name: i.exercise.name,
        loadMode: i.exercise.loadMode,
        straps: i.straps,
        notes: i.notes,
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
      text: `Sleep ${formatSleep(view.checkIn.sleepMin)}, so progression is held.`,
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
          exerciseId: exerciseRef(i.exercise),
          exerciseUuid: i.exercise.id,
          plannedExercise: i.swapped ? i.plannedExercise?.name ?? null : undefined,
          blockedReason: i.blockedReason,
          loadMode: i.exercise.loadMode,
          notes: i.notes,
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
      avgHr?: number | null;
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
  // Validate everything before the first insert: neon-http has no transactions.
  const noLoad = resolved
    .filter(({ ex }) => ex!.loadMode !== "TIME")
    .map(({ e }) => e)
    .filter((e) => e.sets.some((st) => st.kg == null && st.platesKg == null));
  if (noLoad.length) {
    throw new DomainError(
      `Every set needs kg or platesKg (use kg: 0 for bodyweight): ${noLoad.map((e) => e.exerciseId).join(", ")}`
    );
  }

  const ids = resolved.map((r) => r.ex!.id);
  // Back-dated sessions compare against what came before *that* date.
  const prevs = await previousSessions(userId, domain, ids, { date: p.date });

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
    const blocked = blockedReason(d, cons) != null;
    const raw: SetLogEntry[] = e.sets.map((st) => ({
      reps: st.reps,
      weight: d.loadMode === "TIME" ? 0 : st.platesKg != null ? trueKg(d, st.platesKg) : st.kg!,
      platesKg: d.loadMode === "TIME" ? null : st.platesKg ?? null,
      rpe: st.rpe ?? null,
      type: st.type ?? "working",
      ...(st.avgHr != null ? { avgHr: st.avgHr } : {}),
    }));
    const sets = annotateSets(d, raw, prevs.get(d.id)?.topKg ?? null, { blockedOverride: blocked });
    if (blocked) flagged.push(`${d.name} is blocked. Logged with a blocked_override flag`);
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

/**
 * All DONE sessions as ExportSessions, newest first (for latest.md). Batched:
 * a fixed handful of queries however many sessions, since the export needs no
 * per-session history lookups.
 */
export async function exportSessions(
  userId: string,
  opts: { date?: string; limit?: number } = {}
): Promise<ExportSession[]> {
  const rows = await db
    .select()
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
  if (rows.length === 0) return [];

  const planIds = Array.from(new Set(rows.map((r) => r.planId).filter((id): id is string => !!id)));
  const dates = Array.from(new Set(rows.map((r) => r.date)));
  const [{ byId }, logged, planRows, checkIns, profile] = await Promise.all([
    exerciseIndex(userId),
    db
      .select()
      .from(sessionExercises)
      .where(inArray(sessionExercises.sessionId, rows.map((r) => r.id)))
      .orderBy(asc(sessionExercises.orderIndex)),
    planIds.length
      ? db.query.plans.findMany({
          where: and(eq(plans.userId, userId), inArray(plans.id, planIds)),
          with: { items: { orderBy: [asc(planItems.orderIndex)] } },
        })
      : Promise.resolve([]),
    db
      .select()
      .from(dailyCheckIns)
      .where(and(eq(dailyCheckIns.userId, userId), inArray(dailyCheckIns.date, dates))),
    getProfile(userId),
  ]);
  const targets = { proteinG: profile.targets.proteinG, waterMl: profile.targets.waterMl };

  const planById = new Map(planRows.map((p) => [p.id, p]));
  const checkInByDate = new Map(checkIns.map((c) => [c.date, c]));
  const loggedBySession = new Map<string, SessionExerciseRow[]>();
  for (const se of logged) {
    const list = loggedBySession.get(se.sessionId) ?? [];
    list.push(se);
    loggedBySession.set(se.sessionId, list);
  }

  return rows.map((s) => {
    const plan = s.planId ? planById.get(s.planId) ?? null : null;
    const c = checkInByDate.get(s.date);
    return {
      date: s.date,
      sessionType: s.sessionType,
      title: sessionTitle(s, plan),
      notes: s.notes,
      checkIn: c ? { sleepMin: c.sleepMin, proteinG: c.proteinG, waterMl: c.waterMl } : null,
      targets,
      exercises: assembleItems(plan, s.swaps ?? {}, loggedBySession.get(s.id) ?? []).flatMap((a) => {
        const ex = byId.get(a.exerciseId);
        const sets = a.row ? resolveSets(a.row) : [];
        if (!ex || sets.length === 0) return [];
        return [
          {
            name: ex.name,
            loadMode: ex.loadMode,
            straps: a.planItem?.straps ?? false,
            notes: a.row?.notes ?? null,
            sets,
          },
        ];
      }),
    };
  });
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


export interface RotationSummary {
  /** Newest DONE session whose type is in the rotation; cardio skipped. */
  lastType: string | null;
  /** Per type: the most recent DONE session's date and title ("Push + legs"). */
  lastByType: Record<string, { date: string; title: string }>;
  /** First session ever, for "DAY 47". */
  firstDate: string | null;
}

/** What the Today rotation control needs, in two small queries. */
export async function rotationSummary(userId: string, rotation: readonly string[]): Promise<RotationSummary> {
  const [recent, [first]] = await Promise.all([
    db
      .select({ date: sessions.date, type: sessions.sessionType, name: sessions.sessionName })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.status, "DONE")))
      .orderBy(desc(sessions.date), desc(sessions.createdAt))
      .limit(60),
    db
      .select({ date: sessions.date })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(asc(sessions.date))
      .limit(1),
  ]);
  const lastByType: RotationSummary["lastByType"] = {};
  let lastType: string | null = null;
  for (const r of recent) {
    if (!r.type || !rotation.includes(r.type)) continue;
    lastType ??= r.type;
    lastByType[r.type] ??= { date: r.date, title: r.name.replace(/^Session \S+\s*·\s*/, "") };
  }
  return { lastType, lastByType, firstDate: first?.date ?? null };
}
