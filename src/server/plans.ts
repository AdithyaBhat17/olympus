import "server-only";
import { db } from "@/lib/db";
import { planItems, plans, sessions } from "@/lib/db/schema";
import { and, asc, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { todayInTz } from "@/lib/dates";
import {
  DEFAULT_REST_SEC,
  topSet,
  validatePlan,
  type DomainExercise,
  type Issue,
  type PlanInput,
  type PlanItemInput,
  type PlanSet,
  type PlanStatus,
  type RecoveryGate,
} from "@/domain";
import { exerciseRef, getConstraints, listExercises, resolveRef } from "./exercises";
import { lastTopSetKg, resolveSets } from "./history";
import { getCheckIn } from "./checkins";
import { sendPushToUser } from "./push";

export type PlanRow = typeof plans.$inferSelect;
export type PlanItemRow = typeof planItems.$inferSelect;

/** Plan as Claude sends it: exercise refs may be uuid, slug or name. */
export interface PlanPayload extends Omit<PlanInput, "items"> {
  items: Array<Omit<PlanItemInput, "exerciseId"> & { exerciseId: string }>;
}

export interface PushPlanResult {
  planId: string | null;
  status: PlanStatus | null;
  errors: Issue[];
  warnings: Issue[];
  summary: string;
}

async function validateAgainstDb(
  userId: string,
  payload: PlanPayload,
  opts: { ignorePlanId?: string } = {}
) {
  const [all, cons] = await Promise.all([listExercises(userId), getConstraints(userId)]);
  const byId = new Map(all.map((e) => [e.id, e]));

  // Resolve refs → ids; unknown refs stay as-is so V0 reports them.
  const items: PlanItemInput[] = payload.items.map((it) => ({
    ...it,
    exerciseId: resolveRef(all, it.exerciseId)?.id ?? it.exerciseId,
  }));
  const ids = items.map((i) => i.exerciseId).filter((id) => byId.has(id));

  const [tops, checkIn, inProgress] = await Promise.all([
    lastTopSetKg(userId, all, ids),
    getCheckIn(userId, payload.date),
    db
      .select({ id: plans.id })
      .from(plans)
      .where(
        and(
          eq(plans.userId, userId),
          eq(plans.date, payload.date),
          eq(plans.sessionType, payload.sessionType),
          eq(plans.status, "IN_PROGRESS"),
          opts.ignorePlanId ? ne(plans.id, opts.ignorePlanId) : undefined
        )
      ),
  ]);

  const input: PlanInput = { ...payload, items };
  const result = validatePlan(input, {
    exercises: byId,
    constraints: cons,
    lastTopSetKg: tops,
    sleepMinToday: checkIn?.sleepMin ?? null,
    inProgressPlanExists: inProgress.length > 0,
  });
  // Same id Claude sees everywhere else: the slug, with the uuid alongside.
  const withRef = (i: Issue): Issue => {
    const ex = i.exerciseId ? byId.get(i.exerciseId) : undefined;
    return ex ? { ...i, exerciseId: exerciseRef(ex), exerciseUuid: ex.id } : i;
  };
  result.errors = result.errors.map(withRef);
  result.warnings = result.warnings.map(withRef);
  return { input, result };
}

async function writeItems(planId: string, items: PlanItemInput[]) {
  await db.delete(planItems).where(eq(planItems.planId, planId));
  if (items.length === 0) return;
  await db.insert(planItems).values(
    [...items]
      .sort((a, b) => a.order - b.order)
      .map((it, i) => ({
        planId,
        exerciseId: it.exerciseId,
        orderIndex: i,
        pairGroup: it.pairGroup ?? null,
        restSec: it.restSec,
        straps: it.straps ?? false,
        cues: it.cues ?? [],
        sets: it.sets,
        overrideReason: it.overrideReason ?? null,
      }))
  );
}

function summarize(planId: string | null, r: { errors: Issue[]; warnings: Issue[] }, verb: string) {
  if (r.errors.length) {
    return `Rejected — ${r.errors.length} error(s): ${r.errors.map((e) => `${e.code} ${e.message}`).join(" | ")}`;
  }
  return `${verb} plan ${planId}${r.warnings.length ? ` with ${r.warnings.length} warning(s): ${r.warnings.map((w) => w.code).join(", ")}` : " with no warnings"}.`;
}

/**
 * Validate, then upsert on clientRef. Errors block the write; warnings don't.
 * A plan that's already IN_PROGRESS or DONE is never overwritten.
 */
export async function pushPlan(
  userId: string,
  payload: PlanPayload,
  source: "claude" | "manual" = "claude",
  opts: { notify?: boolean } = {}
): Promise<PushPlanResult> {
  const [existing] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.clientRef, payload.clientRef)));

  if (existing && !["READY", "DRAFT"].includes(existing.status)) {
    const err: Issue = {
      code: "V10",
      level: "error",
      message: `Plan ${payload.clientRef} is already ${existing.status}; it can't be replaced. Push with a new clientRef.`,
    };
    return { planId: existing.id, status: existing.status, errors: [err], warnings: [], summary: summarize(null, { errors: [err], warnings: [] }, "") };
  }

  const { input, result } = await validateAgainstDb(userId, payload, {
    ignorePlanId: existing?.id,
  });
  if (result.errors.length) {
    return { planId: null, status: null, ...result, summary: summarize(null, result, "") };
  }

  const values = {
    userId,
    date: input.date,
    sessionType: input.sessionType,
    title: input.title,
    source,
    clientRef: input.clientRef,
    status: "READY" as const,
    coachNotes: input.coachNotes ?? null,
    recoveryGate: input.recoveryGate ?? null,
    warnings: result.warnings.map((w) => w.message),
    pushedAt: new Date(),
    updatedAt: new Date(),
  };

  let planId: string;
  if (existing) {
    await db.update(plans).set(values).where(eq(plans.id, existing.id));
    planId = existing.id;
  } else {
    const [row] = await db.insert(plans).values(values).returning({ id: plans.id });
    planId = row.id;
  }
  await writeItems(planId, input.items);

  if (opts.notify !== false && source === "claude") {
    await sendPushToUser(userId, {
      title: `Session ${input.sessionType} is ready`,
      body: `${input.title} · from your PT${result.warnings.length ? ` · ${result.warnings.length} note(s)` : ""}`,
      url: "/today",
    }).catch((err) => console.error("push failed", err));
  }

  return {
    planId,
    status: "READY",
    ...result,
    summary: summarize(planId, result, existing ? "Updated" : "Created"),
  };
}

export interface PlanPatch {
  date?: string;
  sessionType?: string;
  title?: string;
  coachNotes?: string | null;
  recoveryGate?: RecoveryGate | null;
  items?: PlanPayload["items"];
}

/** Only while READY. Re-validates the merged plan. */
export async function updatePlan(
  userId: string,
  planId: string,
  patch: PlanPatch
): Promise<PushPlanResult> {
  const plan = await getPlan(userId, planId);
  if (!plan) {
    const err: Issue = { code: "V0", level: "error", message: `Plan ${planId} not found.` };
    return { planId: null, status: null, errors: [err], warnings: [], summary: err.message };
  }
  if (plan.status !== "READY" && plan.status !== "DRAFT") {
    const err: Issue = {
      code: "V10",
      level: "error",
      message: `Plan is ${plan.status}; update_plan only works while it is READY.`,
    };
    return { planId, status: plan.status, errors: [err], warnings: [], summary: err.message };
  }
  const payload: PlanPayload = {
    clientRef: plan.clientRef,
    date: patch.date ?? plan.date,
    sessionType: patch.sessionType ?? plan.sessionType,
    title: patch.title ?? plan.title,
    coachNotes: patch.coachNotes !== undefined ? patch.coachNotes : plan.coachNotes,
    recoveryGate: patch.recoveryGate !== undefined ? patch.recoveryGate : plan.recoveryGate,
    items:
      patch.items ??
      plan.items.map((it) => ({
        exerciseId: it.exerciseId,
        order: it.orderIndex,
        pairGroup: it.pairGroup,
        restSec: it.restSec,
        straps: it.straps,
        cues: it.cues,
        sets: it.sets,
        overrideReason: it.overrideReason,
      })),
  };
  return pushPlan(userId, payload, plan.source, { notify: false });
}

export async function getPlan(
  userId: string,
  planId: string
): Promise<(PlanRow & { items: PlanItemRow[] }) | null> {
  const plan = await db.query.plans.findFirst({
    where: and(eq(plans.id, planId), eq(plans.userId, userId)),
    with: { items: { orderBy: [asc(planItems.orderIndex)] } },
  });
  return plan ?? null;
}

/**
 * The plan the Today screen should show: today's READY/IN_PROGRESS plan, else
 * the next upcoming READY one.
 */
export async function getUpcomingPlan(
  userId: string
): Promise<(PlanRow & { items: PlanItemRow[] }) | null> {
  const today = todayInTz();
  const plan = await db.query.plans.findFirst({
    where: and(
      eq(plans.userId, userId),
      gte(plans.date, today),
      inArray(plans.status, ["READY", "IN_PROGRESS"])
    ),
    orderBy: [asc(plans.date), desc(plans.pushedAt)],
    with: { items: { orderBy: [asc(planItems.orderIndex)] } },
  });
  return plan ?? null;
}

export async function setPlanStatus(userId: string, planId: string, status: PlanStatus) {
  await db
    .update(plans)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)));
}

/**
 * No plan from Claude? Build one from the last DONE session of this type so
 * the live screen always has targets. Stored with source "manual".
 */
export async function planFromLastSession(
  userId: string,
  sessionType: string
): Promise<PushPlanResult> {
  const last = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.userId, userId),
      eq(sessions.status, "DONE"),
      eq(sessions.sessionType, sessionType)
    ),
    orderBy: [desc(sessions.date), desc(sessions.createdAt)],
    with: { sessionExercises: { with: { exercise: true } } },
  });
  const all = await listExercises(userId);
  const byId = new Map<string, DomainExercise>(all.map((e) => [e.id, e]));
  const today = todayInTz();
  const items: PlanPayload["items"] = (last?.sessionExercises ?? [])
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((se, i) => {
      const ex = byId.get(se.exerciseId);
      const done = resolveSets(se);
      const top = topSet(ex?.loadMode ?? "TOTAL", done);
      const sets: PlanSet[] = done.map((s) => ({
        type: s.type ?? "working",
        reps: [s.reps, s.reps],
        rpe: s.rpe ?? undefined,
        openKg: s.type === "warmup" ? s.weight : top?.weight ?? s.weight,
      }));
      return {
        exerciseId: se.exerciseId,
        order: i,
        restSec: ex?.isCompound ? DEFAULT_REST_SEC.compound : DEFAULT_REST_SEC.accessory,
        sets,
      };
    });
  return pushPlan(
    userId,
    {
      clientRef: `manual-${today}-${sessionType}-${Date.now()}`,
      date: today,
      sessionType,
      title: last?.sessionName?.replace(/^Session [A-Z]\s*[·—-]\s*/, "") || `Session ${sessionType}`,
      items,
    },
    "manual",
    { notify: false }
  );
}
