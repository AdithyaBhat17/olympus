import "server-only";
import { db } from "@/lib/db";
import { externalActivities, integrations } from "@/lib/db/schema";
import { and, eq, gte, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { upsertCheckIn } from "../checkins";
import { upsertWearableDays, type WearableColumn } from "./wearable-store";
import {
  mainSleepByDate,
  parseWorkout,
  recoveryByDate,
  sleepDetailByDate,
  wearableByDate,
  type WhoopRecovery,
  type WhoopSleep,
  type WhoopWorkout,
} from "./whoop-parse";

/**
 * WHOOP Developer API v2 — sleep → daily check-in sleep minutes, recovery →
 * HRV + resting HR (ranked below Garmin, above Apple Health: see
 * check-in-sources), workouts → external_activities. The fallback for
 * everything Garmin tracks that Whoop also measures; stress, Body Battery and
 * steps have no Whoop equivalent.
 * Docs: https://developer.whoop.com/api/ (OAuth 2.0, scope read:sleep + offline).
 */

const AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const API = "https://api.prod.whoop.com/developer/v2";
export const WHOOP_SCOPES = "offline read:sleep read:recovery read:workout";
const STALE_MS = 30 * 60 * 1000;
const MAX_RECORDS = 5 * 25; // fetchAll: 5 pages of 25

export function whoopConfigured(): boolean {
  return !!process.env.WHOOP_CLIENT_ID && !!process.env.WHOOP_CLIENT_SECRET;
}

export function whoopAuthorizeUrl(redirectUri: string, state: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", process.env.WHOOP_CLIENT_ID!);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", WHOOP_SCOPES);
  u.searchParams.set("state", state);
  return u.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.WHOOP_CLIENT_ID!,
      client_secret: process.env.WHOOP_CLIENT_SECRET!,
      ...body,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`WHOOP token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function saveTokens(userId: string, t: TokenResponse) {
  const values = {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    lastError: null,
  };
  await db
    .insert(integrations)
    .values({ userId, provider: "whoop", ...values })
    .onConflictDoUpdate({
      target: [integrations.userId, integrations.provider],
      set: t.refresh_token ? values : { ...values, refreshToken: undefined },
    });
}

export async function connectWhoop(userId: string, code: string, redirectUri: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  await saveTokens(userId, t);
  await syncWhoop(userId, 14);
}

export async function disconnectWhoop(userId: string) {
  const row = await getWhoop(userId);
  if (row?.accessToken) {
    // Best effort: tell WHOOP to drop the grant too.
    await fetch(`${API}/user/access`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${row.accessToken}` },
    }).catch(() => {});
  }
  await db
    .delete(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, "whoop")));
}

export async function getWhoop(userId: string) {
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, "whoop")));
  return row ?? null;
}

async function accessToken(userId: string): Promise<string | null> {
  const row = await getWhoop(userId);
  if (!row?.accessToken) return null;
  if (row.expiresAt && row.expiresAt.getTime() - 60_000 > Date.now()) return row.accessToken;
  if (!row.refreshToken) return null;
  const t = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: row.refreshToken,
    scope: "offline",
  });
  await saveTokens(userId, t);
  return t.access_token;
}

class WhoopHttpError extends Error {
  constructor(readonly path: string, readonly status: number) {
    super(`WHOOP ${path} ${status}`);
  }
}

/** Up to 5 pages of a v2 collection, newest first, since `start`. */
async function fetchAll<T>(token: string, path: string, start: string): Promise<T[]> {
  const records: T[] = [];
  let next: string | undefined;
  for (let page = 0; page < 5; page++) {
    const u = new URL(`${API}${path}`);
    u.searchParams.set("start", start);
    u.searchParams.set("limit", "25");
    if (next) u.searchParams.set("nextToken", next);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new WhoopHttpError(path, res.status);
    const body = (await res.json()) as { records: T[]; next_token?: string | null };
    records.push(...body.records);
    next = body.next_token ?? undefined;
    if (!next) break;
  }
  return records;
}

/**
 * Workouts need `read:workout`, which connections made before it was added
 * lack (Whoop answers 403, sometimes 401). They are optional: any failure here
 * returns null so sleep and recovery still sync, and workouts arrive after
 * reconnecting. `complete` is false when the page cap cut the list short.
 */
async function fetchWorkouts(token: string, start: string): Promise<{ records: WhoopWorkout[]; complete: boolean } | null> {
  try {
    const records = await fetchAll<WhoopWorkout>(token, "/activity/workout", start);
    return { records, complete: records.length < MAX_RECORDS };
  } catch (err) {
    if (!(err instanceof WhoopHttpError && (err.status === 401 || err.status === 403))) {
      console.error("whoop workouts", err);
    }
    return null;
  }
}

const WEARABLE_COLUMNS: readonly WearableColumn[] = [
  "hrvMs", "hrvMethod", "restingHr", "sleepMin", "deepMin", "lightMin", "remMin", "awakeMin", "awakenings",
  "napMin", "sleepStart", "sleepEnd", "sleepUtcOffsetMin", "respirationAvg",
];

/**
 * Upserts the window's workouts in one statement, then drops this athlete's
 * Whoop rows inside the window that Whoop no longer returns (deleted or
 * re-timed in the app), so they stop counting toward training load.
 */
async function storeWorkouts(userId: string, start: string, fetched: { records: WhoopWorkout[]; complete: boolean }) {
  const parsed = fetched.records.map(parseWorkout).filter((a) => a != null);
  if (parsed.length) {
    const rows = parsed.map((a) => ({
      userId,
      source: "whoop" as const,
      externalId: a.externalId,
      date: a.date,
      startedAt: a.startedAt,
      endedAt: a.endedAt,
      activityType: a.activityType,
      device: "WHOOP",
      durationMin: a.durationMin,
      distanceM: a.distanceM,
      activeKcal: null,
      avgHr: a.avgHr,
      maxHr: a.maxHr,
      hrCoveredMin: a.hrCoveredMin,
      details: {
        ...(a.utcOffsetMin !== undefined ? { utcOffsetMin: a.utcOffsetMin } : {}),
        ...(a.strain !== undefined ? { strain: a.strain } : {}),
        ...(a.totalKcal != null ? { totalKcal: a.totalKcal } : {}),
      },
      updatedAt: new Date(),
    }));
    const t = externalActivities;
    await db
      .insert(t)
      .values(rows)
      .onConflictDoUpdate({
        target: [t.userId, t.source, t.externalId],
        set: {
          date: sql`excluded.date`,
          startedAt: sql`excluded.started_at`,
          endedAt: sql`excluded.ended_at`,
          activityType: sql`excluded.activity_type`,
          device: sql`excluded.device`,
          durationMin: sql`excluded.duration_min`,
          distanceM: sql`excluded.distance_m`,
          activeKcal: sql`excluded.active_kcal`,
          avgHr: sql`excluded.avg_hr`,
          maxHr: sql`excluded.max_hr`,
          hrCoveredMin: sql`excluded.hr_covered_min`,
          details: sql`excluded.details`,
          updatedAt: sql`now()`,
        },
      });
  }
  // A truncated list only vouches for the span it reached (newest first).
  const reachedFrom = fetched.complete
    ? new Date(start)
    : new Date(Math.min(...fetched.records.map((w) => Date.parse(w.start))));
  if (Number.isNaN(reachedFrom.getTime())) return;
  const ids = fetched.records.map((w) => w.id);
  await db
    .delete(externalActivities)
    .where(
      and(
        eq(externalActivities.userId, userId),
        eq(externalActivities.source, "whoop"),
        gte(externalActivities.startedAt, reachedFrom),
        ids.length ? notInArray(externalActivities.externalId, ids) : undefined
      )
    );
}

export async function syncWhoop(userId: string, days = 3): Promise<number> {
  try {
    const token = await accessToken(userId);
    if (!token) return 0;
    const start = new Date(Date.now() - days * 86_400_000).toISOString();
    const [sleeps, recoveries, workouts] = await Promise.all([
      fetchAll<WhoopSleep>(token, "/activity/sleep", start),
      fetchAll<WhoopRecovery>(token, "/recovery", start),
      fetchWorkouts(token, start),
    ]);

    const byDate = mainSleepByDate(sleeps);
    const details = sleepDetailByDate(sleeps);
    const vitals = recoveryByDate(recoveries, sleeps);
    const dates = new Set([...Array.from(byDate.keys()), ...Array.from(vitals.keys())]);
    for (const date of Array.from(dates)) {
      const v = vitals.get(date);
      await upsertCheckIn(
        userId,
        date,
        {
          sleepMin: byDate.get(date),
          sleepDetail: details.get(date),
          hrvMs: v?.hrvMs,
          restingHr: v?.restingHr,
        },
        "whoop"
      );
    }
    // After the check-in, and failures contained: these are additions, and
    // must never block the sleep and recovery sync that already worked.
    try {
      // Merge: the window can hold a nap whose night began before it.
      await upsertWearableDays(userId, "whoop", WEARABLE_COLUMNS, wearableByDate(sleeps, recoveries), "merge");
      if (workouts) await storeWorkouts(userId, start, workouts);
    } catch (err) {
      console.error("whoop wearable/workout store", err);
    }
    await db
      .update(integrations)
      .set({ lastSyncAt: new Date(), lastError: null })
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, "whoop")));
    return byDate.size;
  } catch (err) {
    await db
      .update(integrations)
      .set({ lastError: String(err instanceof Error ? err.message : err).slice(0, 300) })
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, "whoop")));
    throw err;
  }
}

/**
 * Takes the sync slot atomically unless one was taken within `staleMs`.
 * Concurrent syncs would race the refresh-token rotation (Whoop invalidates a
 * refresh token on first use), and a failing connection is retried at most
 * once per `staleMs`; lastError still records failures.
 */
async function claimSync(userId: string, staleMs: number): Promise<boolean> {
  const claimed = await db
    .update(integrations)
    .set({ lastSyncAt: new Date() })
    .where(
      and(
        eq(integrations.userId, userId),
        eq(integrations.provider, "whoop"),
        or(isNull(integrations.lastSyncAt), lt(integrations.lastSyncAt, new Date(Date.now() - staleMs)))
      )
    )
    .returning({ userId: integrations.userId });
  return claimed.length > 0;
}

/** Cheap enough to call on page loads: one row read unless 30 min have passed. */
export async function syncWhoopIfStale(userId: string): Promise<void> {
  if (!whoopConfigured()) return;
  const row = await getWhoop(userId);
  if (!row?.accessToken) return;
  if (row.lastSyncAt && Date.now() - row.lastSyncAt.getTime() < STALE_MS) return;
  if (await claimSync(userId, STALE_MS)) await syncWhoop(userId, 3);
}

/** For the daily cron: syncs unless another sync started in the last minute. Returns false if skipped. */
export async function syncWhoopForCron(userId: string): Promise<number | null> {
  if (!(await claimSync(userId, 60_000))) return null;
  return syncWhoop(userId, 3);
}

/** Every athlete with Whoop connected, for the daily cron. */
export async function whoopUserIds(): Promise<string[]> {
  const rows = await db
    .select({ userId: integrations.userId })
    .from(integrations)
    .where(eq(integrations.provider, "whoop"));
  return rows.map((r) => r.userId);
}
