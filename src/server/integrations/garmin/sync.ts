import "server-only";
import { createHash } from "node:crypto";
import { and, eq, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityStreams,
  dailyWearable,
  externalActivities,
  integrations,
  rawGarmin,
  type IntegrationSyncState,
} from "@/lib/db/schema";
import { addDays } from "@/lib/dates";
import { upsertCheckIn } from "../../checkins";
import { todayFor } from "../../profile";
import { sendPushToUser } from "../../push";
import { decryptSecret, encryptSecret } from "../../secrets";
import { GarminApiError, GarminClient } from "./client";
import { ACTIVITY_LIST_PATH, chunkWindow, fillPath, GARMIN_ENDPOINTS, rangeRequest } from "./endpoints";
import { decodeFit, extractFitFiles, fitLaps, fitMeta, hrCoveredMin, hrSeries, packHr, strengthSets } from "./fit";
import {
  checkInPatch,
  itemsOf,
  mergeDays,
  parseActivity,
  parseDailySummary,
  parseHrvDay,
  parseSleepDay,
  type WearableDay,
} from "./parse";

/**
 * Garmin Personal API → Olympus. Pull-only and incremental:
 *
 * - Daily data (HRV, sleep, daily summary) for the window since the last
 *   sync, re-reading the last 2 days because the watch uploads late.
 *   stress/steps reject 30-day windows, so every range call uses 28.
 * - Raw items go to raw_garmin (one row per endpoint+day / activity), parsed
 *   days to daily_wearable, and sleep, HRV and resting HR to the merged
 *   daily check-in as source "garmin" (see check-in-sources for who wins).
 * - Activities go to external_activities (source "garmin"); each one's FIT
 *   is fetched once, parsed for 1 Hz HR and laps, and kept in
 *   activity_streams.
 */

const STALE_MS = 30 * 60 * 1000;
const WINDOW_DAYS = 28;
const LATE_UPLOAD_DAYS = 2;
const FIRST_SYNC_DAYS = 90;
const MAX_FITS_PER_RUN = 15;
/** Reminders this many days before the key expires. */
const EXPIRY_REMINDER_DAYS = [14, 7, 3, 1];

export function garminConfigured(): boolean {
  return !!process.env.GARMIN_SECRET_KEY;
}

export async function getGarmin(userId: string) {
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, "garmin")));
  return row ?? null;
}

/** Checks the key with Garmin, then stores it encrypted. Throws with a readable message if Garmin rejects it. */
export async function connectGarmin(userId: string, apiKey: string, keyExpiresAt: Date): Promise<void> {
  const key = apiKey.trim();
  if (key.length < 20) throw new Error("That doesn't look like a Garmin personal API key.");
  try {
    await new GarminClient({ apiKey: key }).getToken();
  } catch (err) {
    if (err instanceof GarminApiError && (err.status === 401 || err.status === 403)) {
      throw new Error("Garmin rejected that key. Check it hasn't expired or been deleted.");
    }
    throw err;
  }
  const values = {
    secretEnc: encryptSecret(key, userId),
    keyExpiresAt,
    lastError: null,
    lastSyncAt: null,
    syncState: {} as IntegrationSyncState,
  };
  await db
    .insert(integrations)
    .values({ userId, provider: "garmin", ...values })
    .onConflictDoUpdate({ target: [integrations.userId, integrations.provider], set: values });
}

/** Forgets the key. Synced data stays: it's the athlete's history. */
export async function disconnectGarmin(userId: string): Promise<void> {
  await db.delete(integrations).where(and(eq(integrations.userId, userId), eq(integrations.provider, "garmin")));
}

function sha256(v: unknown): string {
  return createHash("sha256").update(JSON.stringify(v)).digest("hex");
}

async function storeRaw(userId: string, endpoint: string, rows: Array<{ key: string; date: string | null; payload: unknown }>) {
  if (!rows.length) return;
  await db
    .insert(rawGarmin)
    .values(
      rows.map((r) => ({
        userId,
        endpoint,
        resourceKey: r.key,
        localDate: r.date,
        payload: r.payload,
        payloadSha256: sha256(r.payload),
      }))
    )
    .onConflictDoUpdate({
      target: [rawGarmin.userId, rawGarmin.endpoint, rawGarmin.resourceKey],
      set: {
        payload: sql`excluded.payload`,
        payloadSha256: sql`excluded.payload_sha256`,
        localDate: sql`excluded.local_date`,
        fetchedAt: sql`now()`,
      },
    });
}

const ep = (id: string) => GARMIN_ENDPOINTS.find((e) => e.id === id)!;

/** HRV, sleep and the daily summary for [from, to], parsed into days. */
async function fetchDays(client: GarminClient, userId: string, from: string, to: string): Promise<Map<string, WearableDay>> {
  const parts: Array<WearableDay | null> = [];
  for (const [a, b] of chunkWindow(from, to, WINDOW_DAYS)) {
    const sources = [
      { id: "hrv.daily", key: "hrvSummaries", parse: parseHrvDay },
      { id: "sleep.summaries", key: "", parse: parseSleepDay },
      { id: "summary.v2", key: "data", parse: parseDailySummary },
    ];
    for (const s of sources) {
      const req = rangeRequest(ep(s.id), a, b);
      const res = await client.getJson(req.path, req.query);
      const items = itemsOf(res.data, s.key);
      await storeRaw(
        userId,
        s.id,
        items
          .filter((i) => typeof i.calendarDate === "string")
          .map((i) => ({ key: i.calendarDate as string, date: i.calendarDate as string, payload: i }))
      );
      parts.push(...items.map(s.parse));
    }
  }
  return mergeDays(parts);
}

const WEARABLE_COLUMNS = [
  "hrvMs", "hrvMethod", "hrvWeeklyAvgMs", "hrv5minHighMs", "hrvStatus", "restingHr", "sleepMin", "deepMin",
  "lightMin", "remMin", "awakeMin", "awakenings", "napMin", "sleepStart", "sleepEnd", "sleepUtcOffsetMin",
  "sleepHrAvg", "respirationAvg", "spo2Avg", "sleepStressAvg", "sleepNeed", "stressAvg", "stress",
  "bodyBattery", "steps", "moderateMin", "vigorousMin", "activeKcal", "jetLag",
] as const;

/**
 * A day is replaced whole: each sync re-reads every endpoint for every day in
 * its window, so a value Garmin no longer reports is cleared rather than kept.
 */
async function storeDays(userId: string, days: Map<string, WearableDay>) {
  const rows = [...days.values()].map((d) => {
    const row: Record<string, unknown> = { userId, date: d.date, source: "garmin", updatedAt: new Date() };
    for (const c of WEARABLE_COLUMNS) row[c] = (d as Record<string, unknown>)[c] ?? null;
    return row as typeof dailyWearable.$inferInsert;
  });
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const set: Record<string, unknown> = { updatedAt: sql`now()` };
    for (const c of WEARABLE_COLUMNS) set[c] = sql.raw(`excluded.${dailyWearable[c].name}`);
    await db
      .insert(dailyWearable)
      .values(batch)
      .onConflictDoUpdate({ target: [dailyWearable.userId, dailyWearable.date, dailyWearable.source], set });
  }
  for (const d of days.values()) {
    const patch = checkInPatch(d);
    if (Object.keys(patch).length) await upsertCheckIn(userId, d.date, patch, "garmin");
  }
}

/** Activities that started in [from, to]; returns how many were seen. */
async function syncActivities(client: GarminClient, userId: string, from: string, to: string): Promise<number> {
  let seen = 0;
  for (let start = 0; ; start += 100) {
    const res = await client.getJson<unknown[]>(ACTIVITY_LIST_PATH, {
      startDate: from,
      endDate: to,
      start,
      limit: 100,
      sortOrder: "asc",
    });
    const items = Array.isArray(res.data) ? (res.data as Array<Record<string, unknown>>) : [];
    const parsed = items.map((i) => ({ raw: i, a: parseActivity(i) })).filter((x) => x.a);
    await storeRaw(
      userId,
      "activity.list",
      parsed.map(({ raw, a }) => ({ key: a!.externalId, date: a!.date, payload: raw }))
    );
    for (const { a } of parsed) {
      const row = {
        date: a!.date,
        startedAt: a!.startedAt,
        endedAt: a!.endedAt,
        activityType: a!.activityType,
        device: a!.device,
        durationMin: a!.durationMin,
        distanceM: a!.distanceM,
        activeKcal: a!.activeKcal,
        avgHr: a!.avgHr,
        maxHr: a!.maxHr,
        details: a!.details,
        updatedAt: new Date(),
      };
      // hr_covered_min comes from the FIT, so a re-sync leaves it alone.
      await db
        .insert(externalActivities)
        .values({ userId, source: "garmin", externalId: a!.externalId, ...row })
        .onConflictDoUpdate({
          target: [externalActivities.userId, externalActivities.source, externalActivities.externalId],
          set: row,
        });
    }
    seen += parsed.length;
    if (items.length < 100) break;
  }
  return seen;
}

/** Downloads and parses the FIT for up to `limit` Garmin activities that don't have a stream yet. */
async function syncStreams(client: GarminClient, userId: string, limit: number): Promise<number> {
  const pending = await db
    .select({ externalId: externalActivities.externalId })
    .from(externalActivities)
    .where(
      and(
        eq(externalActivities.userId, userId),
        eq(externalActivities.source, "garmin"),
        notExists(
          db
            .select({ one: sql`1` })
            .from(activityStreams)
            .where(
              and(
                eq(activityStreams.userId, externalActivities.userId),
                eq(activityStreams.source, externalActivities.source),
                eq(activityStreams.externalId, externalActivities.externalId)
              )
            )
        )
      )
    )
    .orderBy(sql`${externalActivities.startedAt} desc`)
    .limit(limit);

  let done = 0;
  for (const { externalId } of pending) {
    let meta: Record<string, unknown> = {};
    let stream = { start: null as Date | null, t: [] as number[], bpm: [] as number[] };
    let laps: ReturnType<typeof fitLaps> = [];
    let sets: unknown[] = [];
    let covered: number | null = null;
    try {
      const res = await client.getBytes(fillPath(ep("activity.file").path, { activityId: externalId }));
      const file = extractFitFiles(res.data)[0];
      if (file) {
        const fit = decodeFit(file.name, file.bytes);
        const hr = hrSeries(fit.messages);
        stream = packHr(hr);
        laps = fitLaps(fit.messages);
        sets = strengthSets(fit.messages);
        meta = { ...fitMeta(fit.messages), ...(fit.errors.length ? { errors: fit.errors.slice(0, 3) } : {}) };
        covered = hr.length ? hrCoveredMin(hr) : null;
      } else {
        meta = { errors: ["download had no FIT file"] };
      }
    } catch (err) {
      // A missing file (manual entry) is recorded and not retried; anything else is retried next run.
      if (err instanceof GarminApiError && err.status === 404) meta = { errors: ["no file on Garmin (404)"] };
      else throw err;
    }
    await db
      .insert(activityStreams)
      .values({
        userId,
        source: "garmin",
        externalId,
        hrStart: stream.start,
        hrT: stream.t,
        hrBpm: stream.bpm,
        laps,
        strengthSets: sets,
        fitMeta: meta,
      })
      .onConflictDoNothing();
    if (covered != null) {
      await db
        .update(externalActivities)
        .set({ hrCoveredMin: covered })
        .where(
          and(
            eq(externalActivities.userId, userId),
            eq(externalActivities.source, "garmin"),
            eq(externalActivities.externalId, externalId)
          )
        );
    }
    done++;
  }
  return done;
}

export interface GarminSyncResult {
  from: string;
  to: string;
  days: number;
  activities: number;
  streams: number;
}

/**
 * Sync since the last run (or `days` back when given). Returns null when
 * Garmin isn't connected. Records failures on the integration and rethrows.
 */
export async function syncGarmin(userId: string, opts: { days?: number } = {}): Promise<GarminSyncResult | null> {
  const row = await getGarmin(userId);
  if (!row?.secretEnc) return null;
  try {
    const client = new GarminClient({ apiKey: decryptSecret(row.secretEnc, userId) });
    const today = await todayFor(userId);
    const through = row.syncState?.dailyThrough;
    const from = opts.days
      ? addDays(today, -(opts.days - 1))
      : through
        ? [addDays(through, -LATE_UPLOAD_DAYS), addDays(today, -364)].sort().at(-1)!
        : addDays(today, -(FIRST_SYNC_DAYS - 1));

    const days = await fetchDays(client, userId, from, today);
    await storeDays(userId, days);
    // A day either side: an activity's Garmin date is local to where it was recorded.
    const activities = await syncActivities(client, userId, addDays(from, -1), addDays(today, 1));
    const streams = await syncStreams(client, userId, MAX_FITS_PER_RUN);

    const state: IntegrationSyncState = { ...(row.syncState ?? {}), dailyThrough: today };
    await db
      .update(integrations)
      .set({ lastSyncAt: new Date(), lastError: null, syncState: state })
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, "garmin")));
    return { from, to: today, days: days.size, activities, streams };
  } catch (err) {
    const message =
      err instanceof GarminApiError && (err.status === 401 || err.status === 403) && err.path.includes("token")
        ? "Garmin rejected the API key. It may have expired: create a new one in Garmin Connect."
        : String(err instanceof Error ? err.message : err);
    await db
      .update(integrations)
      .set({ lastError: message.slice(0, 300) })
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, "garmin")));
    throw err;
  }
}

/** Cheap enough for page loads: one row read unless 30 min have passed. */
export async function syncGarminIfStale(userId: string): Promise<void> {
  if (!garminConfigured()) return;
  const row = await getGarmin(userId);
  if (!row?.secretEnc) return;
  if (row.lastSyncAt && Date.now() - row.lastSyncAt.getTime() < STALE_MS) return;
  // Claim the slot first so concurrent page loads don't all sync, and a
  // failing key is retried every 30 min rather than on every navigation.
  const claimed = await db
    .update(integrations)
    .set({ lastSyncAt: new Date() })
    .where(
      and(
        eq(integrations.userId, userId),
        eq(integrations.provider, "garmin"),
        or(isNull(integrations.lastSyncAt), lt(integrations.lastSyncAt, new Date(Date.now() - STALE_MS)))
      )
    )
    .returning({ userId: integrations.userId });
  if (!claimed.length) return;
  await syncGarmin(userId);
}

/** Days until the key expires (rounded down), or null when unknown. */
export function daysUntil(expiresAt: Date | null, now = Date.now()): number | null {
  if (!expiresAt) return null;
  return Math.floor((expiresAt.getTime() - now) / 86_400_000);
}

/** Push a reminder at 14, 7, 3 and 1 days before the key expires. At most one a day. */
export async function remindKeyExpiry(userId: string): Promise<boolean> {
  const row = await getGarmin(userId);
  const left = daysUntil(row?.keyExpiresAt ?? null);
  if (!row || left == null || !EXPIRY_REMINDER_DAYS.includes(left)) return false;
  const today = await todayFor(userId);
  if (row.syncState?.expiryRemindedOn === today) return false;
  await sendPushToUser(userId, {
    title: "Garmin key expires soon",
    body: `Your Garmin API key stops working in ${left} day${left === 1 ? "" : "s"}. Create a new one in Garmin Connect and paste it in Settings.`,
    url: "/settings",
    tag: "garmin-key",
  });
  await db
    .update(integrations)
    .set({ syncState: { ...(row.syncState ?? {}), expiryRemindedOn: today } })
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, "garmin")));
  return true;
}

/** Every athlete with Garmin connected, for the daily cron. */
export async function garminUserIds(): Promise<string[]> {
  const rows = await db
    .select({ userId: integrations.userId })
    .from(integrations)
    .where(eq(integrations.provider, "garmin"));
  return rows.map((r) => r.userId);
}
