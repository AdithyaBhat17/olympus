import { z } from "zod";
import { body, isoDate, route, uuid } from "@/server/api";
import { logWithNudges } from "@/server/food/screen";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const input = z.object({
  meal: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  /** Past days only; today's logs are timed now. */
  date: isoDate.optional(),
  time: hhmm.optional(),
  inputMode: z.enum(["text", "search", "barcode", "saved"]),
  rawText: z.string().max(2000).nullable().optional(),
  model: z.string().max(100).nullable().optional(),
  costUsd: z.number().min(0).max(10).nullable().optional(),
  draftIds: z.array(uuid).max(10).optional(),
  items: z
    .array(
      z.object({
        foodId: uuid,
        grams: z.number().positive().max(5000),
        estGrams: z.number().positive().max(5000).nullable().optional(),
        confidence: z.number().min(0).max(1).nullable().optional(),
        time: hhmm.nullable().optional(),
      })
    )
    .max(40),
  /** Supplements named in a describe, logged as doses. */
  doses: z.array(z.object({ supplementId: uuid, time: hhmm.nullable().optional() })).max(20).optional(),
});

export const POST = route(async ({ req, userId }) => logWithNudges(userId, await body(req, input)));
