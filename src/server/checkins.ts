import "server-only";
import { db } from "@/lib/db";
import { dailyCheckIns, type CheckInSource, type SleepDetail } from "@/lib/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { addDays } from "@/lib/dates";
import { summarizeRecovery, type CheckIn, type RecoverySummary } from "@/domain";
import { getProfile, todayFor } from "./profile";

export type CheckInRow = typeof dailyCheckIns.$inferSelect;

export async function getCheckIn(userId: string, date: string): Promise<CheckInRow | null> {
  const [row] = await db
    .select()
    .from(dailyCheckIns)
    .where(and(eq(dailyCheckIns.userId, userId), eq(dailyCheckIns.date, date)));
  return row ?? null;
}

/** Newest first, `days` days ending at `date` (default today). Missing days are omitted. */
export async function listCheckIns(
  userId: string,
  date?: string,
  days = 7
): Promise<CheckInRow[]> {
  date ??= await todayFor(userId);
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
  hrvMs?: number | null;
  restingHr?: number | null;
  /** Syncs only; `source` is filled in from the upsert's source. */
  sleepDetail?: Omit<SleepDetail, "source"> | null;
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

  // Syncs (Whoop, Apple Health) vs values the athlete typed or told Claude:
  // - sleep is one fact per night, so a human value always wins;
  // - protein and water accumulate through the day, so a sync may raise a
  //   human value (they kept logging in MyFitnessPal) but never lower it.
  if (source === "whoop" || source === "apple_health") {
    const human = (s: CheckInSource | undefined) => s === "manual" || s === "claude";
    // Sleep: Whoop first, Apple Health only fills the nights it leaves (a
    // Watch or Garmin wearer without a Whoop). The detail follows the same
    // order but ignores human values: nobody types their REM minutes.
    if (human(sources.sleep) || (source === "apple_health" && sources.sleep === "whoop")) {
      delete patch.sleepMin;
    }
    if (source === "apple_health" && existing?.sleepDetail?.source === "whoop") {
      delete patch.sleepDetail;
    }
    if (human(sources.protein) && (patch.proteinG ?? -1) <= (existing?.proteinG ?? -1)) {
      delete patch.proteinG;
    }
    if (human(sources.water) && (patch.waterMl ?? -1) <= (existing?.waterMl ?? -1)) {
      delete patch.waterMl;
    }
    // HRV and resting HR: Apple Health first, Whoop only fills the gaps it
    // leaves (a Whoop wearer often has no Watch writing these to Health).
    const outranked = (s: CheckInSource | undefined) =>
      human(s) || (source === "whoop" && s === "apple_health");
    if (outranked(sources.hrv)) delete patch.hrvMs;
    if (outranked(sources.rhr)) delete patch.restingHr;
  }
  const next = {
    sleepMin: existing?.sleepMin ?? null,
    proteinG: existing?.proteinG ?? null,
    waterMl: existing?.waterMl ?? null,
    hrvMs: existing?.hrvMs ?? null,
    restingHr: existing?.restingHr ?? null,
    sleepDetail: existing?.sleepDetail ?? null,
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
  if (patch.hrvMs !== undefined) {
    next.hrvMs = patch.hrvMs == null ? null : Math.round(patch.hrvMs);
    sources.hrv = source;
  }
  if (patch.restingHr !== undefined) {
    next.restingHr = patch.restingHr == null ? null : Math.round(patch.restingHr);
    sources.rhr = source;
  }
  if (patch.sleepDetail !== undefined && (source === "whoop" || source === "apple_health")) {
    next.sleepDetail = patch.sleepDetail == null ? null : { ...patch.sleepDetail, source };
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
  date?: string,
  days = 7
): Promise<{ checkIns: CheckInRow[]; summary: RecoverySummary; today: CheckInRow | null }> {
  const profile = await getProfile(userId);
  date ??= await todayFor(userId);
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
    summary: summarizeRecovery(contiguous.map(toDomainCheckIn), profile.targets),
    today: rows[0]?.date === date ? rows[0] : null,
  };
}
