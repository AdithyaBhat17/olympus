import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { isAllowedUser } from "@/lib/allowlist";
import { sha256 } from "../oauth";
import { upsertCheckIn } from "../checkins";
import { todayFor } from "../profile";

/**
 * Apple Health has no web API (HealthKit is on-device only), and MyFitnessPal
 * has no public API. The bridge: MyFitnessPal writes nutrition into Apple
 * Health, and an iOS Shortcut reads today's protein + water from Health and
 * POSTs them to /api/ingest/health with a per-user token.
 */

export async function getAppleHealth(userId: string) {
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, "apple_health")));
  return row ?? null;
}

/** New ingest token (shown once). Replaces any previous token. */
export async function rotateIngestToken(userId: string): Promise<string> {
  const raw = `olh_${randomBytes(24).toString("base64url")}`;
  await db
    .insert(integrations)
    .values({ userId, provider: "apple_health", ingestTokenHash: sha256(raw) })
    .onConflictDoUpdate({
      target: [integrations.userId, integrations.provider],
      set: { ingestTokenHash: sha256(raw), lastError: null },
    });
  return raw;
}

export async function revokeIngestToken(userId: string) {
  await db
    .delete(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, "apple_health")));
}

export async function userForIngestToken(raw: string): Promise<string | null> {
  if (!raw.startsWith("olh_")) return null;
  const [row] = await db
    .select({ userId: integrations.userId })
    .from(integrations)
    .where(
      and(eq(integrations.provider, "apple_health"), eq(integrations.ingestTokenHash, sha256(raw)))
    );
  // Dropping someone from ALLOWED_EMAILS revokes their ingest token too.
  return row && isAllowedUser(row.userId) ? row.userId : null;
}

export async function markIngested(userId: string) {
  await db
    .update(integrations)
    .set({ lastSyncAt: new Date() })
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, "apple_health")));
}

// ---------------------------------------------------------------------------
// Ingest: the iOS app (bearer /api/v1/health) and the Shortcut
// (olh_ token, /api/ingest/health) both land here.
// ---------------------------------------------------------------------------

const day = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}/)
      .refine((d) => {
        const iso = d.slice(0, 10);
        const t = new Date(`${iso}T00:00:00Z`);
        return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso;
      }, "Not a real date")
      .optional(),
    proteinG: z.coerce.number().min(0).max(1000).optional(),
    waterMl: z.coerce.number().min(0).max(20000).optional(),
    waterL: z.coerce.number().min(0).max(20).optional(),
    sleepMin: z.coerce.number().min(0).max(1440).optional(),
    sleepH: z.coerce.number().min(0).max(24).optional(),
    hrvMs: z.coerce.number().min(1).max(500).optional(),
    restingHr: z.coerce.number().min(20).max(200).optional(),
  })
  .transform((d) => ({
    date: d.date?.slice(0, 10),
    proteinG: d.proteinG,
    waterMl: d.waterMl ?? (d.waterL != null ? d.waterL * 1000 : undefined),
    sleepMin: d.sleepMin ?? (d.sleepH != null ? d.sleepH * 60 : undefined),
    hrvMs: d.hrvMs,
    restingHr: d.restingHr,
  }));

export const healthIngestBody = z.union([z.object({ days: z.array(day).min(1).max(31) }), day]);

export type HealthIngestBody = z.infer<typeof healthIngestBody>;

/** Upsert each day's values as Apple Health check-ins; returns what's stored now. */
export async function ingestHealthDays(userId: string, parsed: HealthIngestBody) {
  const days = "days" in parsed ? parsed.days : [parsed];
  const saved: Array<{
    date: string;
    proteinG: number | null;
    waterMl: number | null;
    sleepMin: number | null;
    hrvMs: number | null;
    restingHr: number | null;
  }> = [];
  const today = await todayFor(userId);
  for (const d of days) {
    const date = d.date ?? today;
    const patch: Record<string, number> = {};
    if (d.proteinG != null) patch.proteinG = d.proteinG;
    if (d.waterMl != null) patch.waterMl = d.waterMl;
    if (d.sleepMin != null) patch.sleepMin = d.sleepMin;
    if (d.hrvMs != null) patch.hrvMs = d.hrvMs;
    if (d.restingHr != null) patch.restingHr = d.restingHr;
    if (Object.keys(patch).length === 0) continue;
    const row = await upsertCheckIn(userId, date, patch, "apple_health");
    saved.push({
      date,
      proteinG: row.proteinG,
      waterMl: row.waterMl,
      sleepMin: row.sleepMin,
      hrvMs: row.hrvMs,
      restingHr: row.restingHr,
    });
  }
  await markIngested(userId);
  return saved;
}
