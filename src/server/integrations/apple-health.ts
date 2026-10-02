import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { sha256 } from "../oauth";

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
  return row?.userId ?? null;
}

export async function markIngested(userId: string) {
  await db
    .update(integrations)
    .set({ lastSyncAt: new Date() })
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, "apple_health")));
}
