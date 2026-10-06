import "server-only";
import { isOwner } from "@/lib/allowlist";
import { DomainError } from "./errors";
import { db } from "@/lib/db";
import { constraints, exerciseBlocks, exercises } from "@/lib/db/schema";
import { and, asc, eq, getTableColumns, isNull, or } from "drizzle-orm";
import {
  blockedReason,
  type DomainConstraint,
  type DomainExercise,
} from "@/domain";

/** A library row as one athlete sees it: their own block, if they set one. */
export type ExerciseRow = typeof exercises.$inferSelect & {
  userBlock: { reason: string | null } | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toDomainExercise(row: ExerciseRow): DomainExercise {
  // Shared rows are blocked per athlete (exercise_blocks); their global
  // status = 'NO' is legacy single-athlete data and doesn't apply to anyone.
  // A custom row is its creator's alone, so its own status still counts.
  const custom = row.createdBy != null;
  const status = row.userBlock ? "NO" : !custom && row.status === "NO" ? "YES" : row.status;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    status,
    loadMode: row.loadMode,
    carriageKgPerSide:
      row.carriageKgPerSide != null ? parseFloat(row.carriageKgPerSide) : null,
    isCompound: row.isCompound,
    bodyRegion: row.bodyRegion ?? null,
    equipment: row.equipment,
    blockedReason: row.userBlock ? row.userBlock.reason : custom ? row.blockedReason : null,
    substituteIds: row.substituteIds ?? [],
  };
}

export async function listExerciseRows(userId: string): Promise<ExerciseRow[]> {
  const rows = await db
    .select({ ...getTableColumns(exercises), blockedBy: exerciseBlocks.userId, blockReason: exerciseBlocks.reason })
    .from(exercises)
    .leftJoin(
      exerciseBlocks,
      and(eq(exerciseBlocks.exerciseId, exercises.id), eq(exerciseBlocks.userId, userId))
    )
    .where(or(isNull(exercises.createdBy), eq(exercises.createdBy, userId)))
    .orderBy(exercises.category, exercises.name);
  return rows.map(({ blockedBy, blockReason, ...row }) => ({
    ...row,
    userBlock: blockedBy ? { reason: blockReason } : null,
  }));
}

/**
 * A custom exercise of the athlete's own, for something the library lacks.
 * Reuses the one they can already see under the same name. Returns its id.
 */
export async function addCustomExercise(
  userId: string,
  input: { name: string; category: ExerciseRow["category"] }
): Promise<string> {
  const name = input.name.trim();
  const same = (await listExerciseRows(userId)).find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (same) return same.id;
  const [row] = await db
    .insert(exercises)
    .values({ name, category: input.category, status: "YES", isCustom: true, createdBy: userId })
    .returning({ id: exercises.id });
  return row.id;
}

export async function listExercises(userId: string): Promise<DomainExercise[]> {
  return (await listExerciseRows(userId)).map(toDomainExercise);
}

export async function getConstraints(userId: string): Promise<DomainConstraint[]> {
  return (await listConstraintRows(userId)).map((r) => ({
    region: r.region,
    rule: r.rule,
    blockedPatterns: r.blockedPatterns,
  }));
}

export type ConstraintRow = typeof constraints.$inferSelect;

/** The athlete's own active constraints. Rows without an owner apply to no one. */
export async function listConstraintRows(userId: string): Promise<ConstraintRow[]> {
  return db
    .select()
    .from(constraints)
    .where(and(eq(constraints.active, true), eq(constraints.userId, userId)))
    .orderBy(asc(constraints.region));
}

export interface ConstraintInput {
  region: string;
  rule: string;
  blockedPatterns: string[];
}

/** Add an injury, or rewrite (and re-activate) the one with the same region. */
export async function saveConstraint(userId: string, input: ConstraintInput): Promise<void> {
  const region = input.region.trim();
  const rule = input.rule.trim();
  const blockedPatterns = Array.from(
    new Set(input.blockedPatterns.map((p) => p.trim().toLowerCase()).filter(Boolean))
  );
  if (!region || region.length > 80) throw new DomainError("Name the injury in 1–80 characters");
  if (!rule || rule.length > 500) throw new DomainError("Describe the rule in 1–500 characters");
  if (blockedPatterns.length > 30 || blockedPatterns.some((p) => p.length > 60)) {
    throw new DomainError("Up to 30 blocked movements, 60 characters each");
  }
  const [existing] = await db
    .select({ id: constraints.id })
    .from(constraints)
    .where(and(eq(constraints.userId, userId), eq(constraints.region, region)));
  if (existing) {
    await db
      .update(constraints)
      .set({ rule, blockedPatterns, active: true })
      .where(eq(constraints.id, existing.id));
  } else {
    await db.insert(constraints).values({ userId, region, rule, blockedPatterns });
  }
}

/** Retire a constraint. Kept as a row (inactive), like resolved coach flags. */
export async function retireConstraint(userId: string, id: string): Promise<void> {
  const res = await db
    .update(constraints)
    .set({ active: false })
    .where(and(eq(constraints.id, id), eq(constraints.userId, userId)))
    .returning({ id: constraints.id });
  if (res.length === 0) throw new DomainError("Constraint not found");
}

/** Take a library exercise off the table for this athlete, or put it back (null). */
export async function setExerciseBlock(
  userId: string,
  exerciseId: string,
  reason: string | null
): Promise<void> {
  if (reason === null) {
    await db
      .delete(exerciseBlocks)
      .where(and(eq(exerciseBlocks.userId, userId), eq(exerciseBlocks.exerciseId, exerciseId)));
    return;
  }
  const visible = (await listExerciseRows(userId)).some((r) => r.id === exerciseId);
  if (!visible) throw new DomainError("Exercise not found");
  const why = reason.trim().slice(0, 200) || null;
  await db
    .insert(exerciseBlocks)
    .values({ userId, exerciseId, reason: why })
    .onConflictDoUpdate({
      target: [exerciseBlocks.userId, exerciseBlocks.exerciseId],
      set: { reason: why },
    });
}

/**
 * The one id Claude sees for an exercise everywhere (working weights, flags,
 * sessions, search): the slug when it has one, else the uuid. Every payload
 * that carries it also carries `exerciseUuid`, so joins work either way.
 */
export function exerciseRef(ex: { id: string; slug?: string | null }): string {
  return ex.slug ?? ex.id;
}

/** Resolve a uuid, slug or exact (case-insensitive) name to an exercise. */
export function resolveRef(
  all: DomainExercise[],
  ref: string
): DomainExercise | null {
  const r = ref.trim();
  if (UUID_RE.test(r)) return all.find((e) => e.id === r) ?? null;
  const lower = r.toLowerCase();
  return (
    all.find((e) => e.slug === lower) ??
    all.find((e) => e.name.toLowerCase() === lower) ??
    null
  );
}

export async function resolveExerciseRef(
  userId: string,
  ref: string
): Promise<DomainExercise | null> {
  return resolveRef(await listExercises(userId), ref);
}

export interface ExerciseSearchHit {
  /** Pass this as exerciseId: the slug when there is one, else the uuid. */
  exerciseId: string;
  exerciseUuid: string;
  id: string;
  slug: string | null;
  name: string;
  category: string;
  status: string;
  loadMode: string;
  carriageKgPerSide: number | null;
  blocked: boolean;
  blockedReason: string | null;
  substitutes: Array<{ id: string; slug: string | null; name: string }>;
}

export function describeExercise(
  ex: DomainExercise,
  all: DomainExercise[],
  cons: DomainConstraint[]
): ExerciseSearchHit {
  const reason = blockedReason(ex, cons);
  return {
    exerciseId: exerciseRef(ex),
    exerciseUuid: ex.id,
    id: ex.id,
    slug: ex.slug ?? null,
    name: ex.name,
    category: ex.category,
    status: ex.status,
    loadMode: ex.loadMode,
    carriageKgPerSide: ex.carriageKgPerSide,
    blocked: reason != null,
    blockedReason: reason,
    substitutes: (ex.substituteIds ?? [])
      .map((id) => all.find((e) => e.id === id))
      .filter((e): e is DomainExercise => !!e)
      .map((e) => ({ id: e.id, slug: e.slug ?? null, name: e.name })),
  };
}

export async function searchExercises(
  userId: string,
  query: string,
  includeBlocked = false
): Promise<ExerciseSearchHit[]> {
  const [all, cons] = await Promise.all([listExercises(userId), getConstraints(userId)]);
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  return all
    .filter((e) => {
      const hay = `${e.name} ${e.slug ?? ""} ${e.category}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .map((e) => describeExercise(e, all, cons))
    .filter((h) => includeBlocked || !h.blocked)
    .slice(0, 25);
}

export async function setCarriage(
  userId: string,
  exerciseId: string,
  kgPerSide: number | null
): Promise<void> {
  // Custom rows belong to their creator. Global library rows are shared, so
  // only an owner (OWNER_EMAILS, else ALLOWED_EMAILS) may calibrate them.
  const res = await db
    .update(exercises)
    .set({ carriageKgPerSide: kgPerSide == null ? null : kgPerSide.toFixed(2) })
    .where(
      and(
        eq(exercises.id, exerciseId),
        isOwner(userId)
          ? or(isNull(exercises.createdBy), eq(exercises.createdBy, userId))
          : eq(exercises.createdBy, userId)
      )
    )
    .returning({ id: exercises.id });
  if (res.length === 0) {
    throw new DomainError(
      "Only the app owner can change shared machines."
    );
  }
}
