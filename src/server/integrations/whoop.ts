import "server-only";
import { db } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { upsertCheckIn } from "../checkins";

/**
 * WHOOP Developer API v2 — sleep → daily check-in sleep minutes.
 * Docs: https://developer.whoop.com/api/ (OAuth 2.0, scope read:sleep + offline).
 */

const AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const API = "https://api.prod.whoop.com/developer/v2";
export const WHOOP_SCOPES = "offline read:sleep read:recovery";
const STALE_MS = 30 * 60 * 1000;

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

interface WhoopSleep {
  start: string;
  end: string;
  timezone_offset: string; // "-05:00"
  nap: boolean;
  score_state: "SCORED" | "PENDING_SCORE" | "UNSCORABLE";
  score?: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_no_data_time_milli: number;
    };
  };
}

/** The wake-up date in the sleep's own timezone: last night's sleep belongs to today. */
export function wakeDate(s: Pick<WhoopSleep, "end" | "timezone_offset">): string {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(s.timezone_offset ?? "+00:00");
  const offsetMin = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(new Date(s.end).getTime() + offsetMin * 60_000).toISOString().slice(0, 10);
}

/** Minutes actually asleep: in bed minus awake minus no-data. */
export function asleepMinutes(s: WhoopSleep): number | null {
  const st = s.score?.stage_summary;
  if (s.score_state !== "SCORED" || !st) return null;
  const ms = st.total_in_bed_time_milli - st.total_awake_time_milli - st.total_no_data_time_milli;
  return Math.max(0, Math.round(ms / 60_000));
}

export async function syncWhoop(userId: string, days = 3): Promise<number> {
  try {
    const token = await accessToken(userId);
    if (!token) return 0;
    const start = new Date(Date.now() - days * 86_400_000).toISOString();
    const records: WhoopSleep[] = [];
    let next: string | undefined;
    for (let page = 0; page < 5; page++) {
      const u = new URL(`${API}/activity/sleep`);
      u.searchParams.set("start", start);
      u.searchParams.set("limit", "25");
      if (next) u.searchParams.set("nextToken", next);
      const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!res.ok) throw new Error(`WHOOP sleep ${res.status}`);
      const body = (await res.json()) as { records: WhoopSleep[]; next_token?: string | null };
      records.push(...body.records);
      next = body.next_token ?? undefined;
      if (!next) break;
    }

    // Main sleep per wake-up date (longest non-nap).
    const byDate = new Map<string, number>();
    for (const r of records) {
      if (r.nap) continue;
      const min = asleepMinutes(r);
      if (min == null) continue;
      const d = wakeDate(r);
      byDate.set(d, Math.max(byDate.get(d) ?? 0, min));
    }
    for (const [date, sleepMin] of Array.from(byDate.entries())) {
      await upsertCheckIn(userId, date, { sleepMin }, "whoop");
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

/** Cheap enough to call on page loads: one row read unless 30 min have passed. */
export async function syncWhoopIfStale(userId: string): Promise<void> {
  if (!whoopConfigured()) return;
  const row = await getWhoop(userId);
  if (!row?.accessToken) return;
  if (row.lastSyncAt && Date.now() - row.lastSyncAt.getTime() < STALE_MS) return;
  await syncWhoop(userId, 3);
}
