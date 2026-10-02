import "server-only";
import { db } from "@/lib/db";
import { constraints, exercises } from "@/lib/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import {
  blockedReason,
  type DomainConstraint,
  type DomainExercise,
} from "@/domain";

export type ExerciseRow = typeof exercises.$inferSelect;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toDomainExercise(row: ExerciseRow): DomainExercise {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    status: row.status,
    loadMode: row.loadMode,
    carriageKgPerSide:
      row.carriageKgPerSide != null ? parseFloat(row.carriageKgPerSide) : null,
    isCompound: row.isCompound,
    bodyRegion: row.bodyRegion ?? null,
    blockedReason: row.blockedReason,
    substituteIds: row.substituteIds ?? [],
  };
}

export async function listExerciseRows(userId: string): Promise<ExerciseRow[]> {
  return db
    .select()
    .from(exercises)
    .where(or(isNull(exercises.createdBy), eq(exercises.createdBy, userId)))
    .orderBy(exercises.category, exercises.name);
}

export async function listExercises(userId: string): Promise<DomainExercise[]> {
  return (await listExerciseRows(userId)).map(toDomainExercise);
}

export async function getConstraints(userId: string): Promise<DomainConstraint[]> {
  const rows = await db
    .select()
    .from(constraints)
    .where(
      and(
        eq(constraints.active, true),
        or(isNull(constraints.userId), eq(constraints.userId, userId))
      )
    );
  return rows.map((r) => ({
    region: r.region,
    rule: r.rule,
    blockedPatterns: r.blockedPatterns,
  }));
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
  // Global library rows are shared; custom rows are per user.
  await db
    .update(exercises)
    .set({ carriageKgPerSide: kgPerSide == null ? null : kgPerSide.toFixed(2) })
    .where(
      and(
        eq(exercises.id, exerciseId),
        or(isNull(exercises.createdBy), eq(exercises.createdBy, userId))
      )
    );
}
