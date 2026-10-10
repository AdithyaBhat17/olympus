import "server-only";
import { cache } from "react";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { athleteProfiles } from "@/lib/db/schema";
import { DEFAULT_TIMEZONE, isValidTimeZone, todayInTz } from "@/lib/dates";
import { DEFAULT_ROTATION, DEFAULT_TARGETS, parseRotation, type Targets } from "@/domain";
import { DomainError } from "./errors";

export interface AthleteProfile {
  /** The Google account's name, once they've signed in since it was stored. */
  displayName: string | null;
  timezone: string;
  /** False until the browser (or the athlete) has set a timezone. */
  timezoneSet: boolean;
  targets: Targets;
  rotation: string[];
}

/** One read per request; every "today" and target on the page agrees. */
export const getProfile = cache(async (userId: string): Promise<AthleteProfile> => {
  const [row] = await db.select().from(athleteProfiles).where(eq(athleteProfiles.userId, userId));
  const tz = row?.timezone && isValidTimeZone(row.timezone) ? row.timezone : null;
  return {
    displayName: row?.displayName ?? null,
    timezone: tz ?? DEFAULT_TIMEZONE,
    timezoneSet: tz != null,
    targets: row
      ? { kcal: row.kcal, proteinG: row.proteinG, waterMl: row.waterMl, minSleepMin: row.minSleepMin }
      : DEFAULT_TARGETS,
    rotation: row?.rotation.length ? row.rotation : [...DEFAULT_ROTATION],
  };
});

/** YYYY-MM-DD today, in the athlete's timezone. */
export async function todayFor(userId: string): Promise<string> {
  return todayInTz((await getProfile(userId)).timezone);
}

export interface ProfilePatch {
  timezone?: string;
  kcal?: number | null;
  proteinG?: number | null;
  waterMl?: number | null;
  minSleepMin?: number;
  rotation?: string[];
}

function inRange(name: string, v: number | null | undefined, min: number, max: number) {
  if (v == null) return;
  if (!Number.isInteger(v) || v < min || v > max) {
    throw new DomainError(`${name} must be a whole number from ${min} to ${max}`);
  }
}

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<void> {
  if (patch.timezone !== undefined && !isValidTimeZone(patch.timezone)) {
    throw new DomainError(`"${patch.timezone}" isn't a timezone`);
  }
  inRange("Calories", patch.kcal, 800, 8000);
  inRange("Protein", patch.proteinG, 0, 500);
  inRange("Water", patch.waterMl, 0, 10000);
  inRange("Sleep floor", patch.minSleepMin, 180, 720);
  let rotation: string[] | undefined;
  if (patch.rotation !== undefined) {
    const parsed = parseRotation(patch.rotation);
    if ("error" in parsed) throw new DomainError(parsed.error);
    rotation = parsed.rotation;
  }

  const set = {
    ...(patch.timezone !== undefined && { timezone: patch.timezone }),
    ...(patch.kcal !== undefined && { kcal: patch.kcal }),
    ...(patch.proteinG !== undefined && { proteinG: patch.proteinG }),
    ...(patch.waterMl !== undefined && { waterMl: patch.waterMl }),
    ...(patch.minSleepMin !== undefined && { minSleepMin: patch.minSleepMin }),
    ...(rotation && { rotation }),
    updatedAt: new Date(),
  };
  await db
    .insert(athleteProfiles)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: athleteProfiles.userId, set });
}

/** First visit from a browser: adopt its timezone, never overwrite a chosen one. */
/** Keep the Google name current (signing in is when we see it). */
export async function rememberDisplayName(userId: string, name: string | null | undefined): Promise<void> {
  const displayName = name?.trim().slice(0, 100);
  if (!displayName) return;
  await db
    .insert(athleteProfiles)
    .values({ userId, displayName })
    .onConflictDoUpdate({ target: athleteProfiles.userId, set: { displayName } });
}

export async function adoptTimezone(userId: string, timezone: string): Promise<boolean> {
  if (!isValidTimeZone(timezone)) return false;
  const now = new Date();
  const res = await db
    .insert(athleteProfiles)
    .values({ userId, timezone, updatedAt: now })
    .onConflictDoUpdate({
      target: athleteProfiles.userId,
      set: { timezone, updatedAt: now },
      where: and(eq(athleteProfiles.userId, userId), isNull(athleteProfiles.timezone)),
    })
    .returning({ userId: athleteProfiles.userId });
  return res.length > 0;
}
