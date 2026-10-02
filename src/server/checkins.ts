import "server-only";
import { db } from "@/lib/db";
import { dailyCheckIns, type CheckInSource } from "@/lib/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { addDays, todayInTz } from "@/lib/dates";
import { summarizeRecovery, type CheckIn, type RecoverySummary } from "@/domain";

export type CheckInRow = typeof dailyCheckIns.$inferSelect;

export async function getCheckIn(userId: string, date: string): Promise<CheckInRow | null> {
  const [row] = await db
    .select()
    .from(dailyCheckIns)
    .where(and(eq(dailyCheckIns.userId, userId), eq(dailyCheckIns.date, date)));
  return row ?? null;
}

/** Newest first, `days` days ending at `date`. Missing days are omitted. */
export async function listCheckIns(
  userId: string,
  date: string = todayInTz(),
  days = 7
): Promise<CheckInRow[]> {
  return db
    .select()
    .from(dailyCheckIns)
    .where(
      and(
        eq(dailyCheckIns.userId, userId),
        lte(dailyCheckIns.date, date),
        gte(dailyCheckIns.date, addDays(date, -(days - 1)))
      )
    )
    .orderBy(desc(dailyCheckIns.date));
}

export interface CheckInPatch {
  sleepMin?: number | null;
  proteinG?: number | null;
  waterMl?: number | null;
}

/**
 * Merge a partial check-in. Only fields present in `patch` change; each
 * changed field records where it came from. `patch` may be mutated.
 */
export async function upsertCheckIn(
  userId: string,
  date: string,
  patch: CheckInPatch,
  source: CheckInSource
): Promise<CheckInRow> {
  const existing = await getCheckIn(userId, date);
  const sources = { ...(existing?.sources ?? {}) };

  // Integrations (Whoop, Apple Health) never overwrite a value the athlete
  // typed in the app or told Claude for that day. People win over sensors.
  if (source === "whoop" || source === "apple_health") {
    const human = (s: CheckInSource | undefined) => s === "manual" || s === "claude";
    if (human(sources.sleep)) delete patch.sleepMin;
    if (human(sources.protein)) delete patch.proteinG;
    if (human(sources.water)) delete patch.waterMl;
  }
  const next = {
    sleepMin: existing?.sleepMin ?? null,
    proteinG: existing?.proteinG ?? null,
    waterMl: existing?.waterMl ?? null,
  };
  if (patch.sleepMin !== undefined) {
    next.sleepMin = patch.sleepMin == null ? null : Math.round(patch.sleepMin);
    sources.sleep = source;
  }
  if (patch.proteinG !== undefined) {
    next.proteinG = patch.proteinG == null ? null : Math.round(patch.proteinG);
    sources.protein = source;
  }
  if (patch.waterMl !== undefined) {
    next.waterMl = patch.waterMl == null ? null : Math.round(patch.waterMl);
    sources.water = source;
  }
  const [row] = await db
    .insert(dailyCheckIns)
    .values({ userId, date, ...next, sources, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [dailyCheckIns.userId, dailyCheckIns.date],
      set: { ...next, sources, updatedAt: sql`now()` },
    })
    .returning();
  return row;
}

export function toDomainCheckIn(r: CheckInRow): CheckIn {
  return { date: r.date, sleepMin: r.sleepMin, proteinG: r.proteinG, waterMl: r.waterMl };
}

/**
 * Recovery summary for `date`. The streak only counts consecutive days, so a
 * gap in check-ins ends it.
 */
export async function getRecovery(
  userId: string,
  date: string = todayInTz(),
  days = 7
): Promise<{ checkIns: CheckInRow[]; summary: RecoverySummary; today: CheckInRow | null }> {
  const rows = await listCheckIns(userId, date, days);
  const contiguous: CheckInRow[] = [];
  let expect = date;
  for (const r of rows) {
    if (r.date !== expect) break;
    contiguous.push(r);
    expect = addDays(expect, -1);
  }
  return {
    checkIns: rows,
    summary: summarizeRecovery(contiguous.map(toDomainCheckIn)),
    today: rows[0]?.date === date ? rows[0] : null,
  };
}
