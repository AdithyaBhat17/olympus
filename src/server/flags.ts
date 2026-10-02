import "server-only";
import { db } from "@/lib/db";
import { coachFlags } from "@/lib/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";

export type CoachFlagRow = typeof coachFlags.$inferSelect;

export async function listOpenFlags(userId: string): Promise<CoachFlagRow[]> {
  return db
    .select()
    .from(coachFlags)
    .where(and(eq(coachFlags.userId, userId), isNull(coachFlags.resolvedAt)))
    .orderBy(asc(coachFlags.createdAt));
}

/** Flags that apply to a session type and/or exercise (global ones always do). */
export function flagsFor(
  flags: CoachFlagRow[],
  opts: { sessionType?: string | null; exerciseId?: string | null }
): CoachFlagRow[] {
  return flags.filter(
    (f) =>
      f.scope === "global" ||
      (f.scope === "sessionType" && f.scopeValue === opts.sessionType) ||
      (f.scope === "exerciseId" && f.scopeValue === opts.exerciseId)
  );
}

export async function addFlag(
  userId: string,
  input: { text: string; scope: CoachFlagRow["scope"]; scopeValue?: string | null },
  createdBy: "claude" | "user"
): Promise<CoachFlagRow> {
  const [row] = await db
    .insert(coachFlags)
    .values({
      userId,
      text: input.text,
      scope: input.scope,
      scopeValue: input.scope === "global" ? null : input.scopeValue ?? null,
      createdBy,
    })
    .returning();
  return row;
}

export async function resolveFlag(userId: string, id: string): Promise<CoachFlagRow | null> {
  const [row] = await db
    .update(coachFlags)
    .set({ resolvedAt: new Date() })
    .where(and(eq(coachFlags.id, id), eq(coachFlags.userId, userId)))
    .returning();
  return row ?? null;
}
