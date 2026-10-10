import { z } from "zod";
import { body, isoDate, route } from "@/server/api";
import { upsertCheckIn } from "@/server/checkins";
import { todayFor } from "@/server/profile";

const input = z.object({
  date: isoDate.optional(),
  sleepMin: z.number().int().min(0).max(1440).nullable().optional(),
  proteinG: z.number().int().min(0).max(1000).nullable().optional(),
  waterMl: z.number().int().min(0).max(20000).nullable().optional(),
});

/** A check-in the athlete typed: absolute values, so replaying it is safe. */
export const POST = route(async ({ req, userId }) => {
  const { date, ...patch } = await body(req, input);
  const row = await upsertCheckIn(userId, date ?? (await todayFor(userId)), patch, "manual");
  return { checkIn: row };
});
