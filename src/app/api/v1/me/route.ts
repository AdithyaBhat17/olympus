import { z } from "zod";
import { body, route } from "@/server/api";
import { getProfile, updateProfile } from "@/server/profile";

/** Who's signed in and their profile (timezone, targets, rotation). */
export const GET = route(async ({ userId }) => ({ email: userId, profile: await getProfile(userId) }));

const patch = z.object({
  timezone: z.string().max(64).optional(),
  kcal: z.number().int().nullable().optional(),
  proteinG: z.number().int().nullable().optional(),
  waterMl: z.number().int().nullable().optional(),
  minSleepMin: z.number().int().optional(),
  rotation: z.array(z.string().max(2)).max(6).optional(),
});

/** Settings › Your training. Range rules live in updateProfile. */
export const PATCH = route(async ({ req, userId }) => {
  await updateProfile(userId, await body(req, patch));
  return { email: userId, profile: await getProfile(userId) };
});
