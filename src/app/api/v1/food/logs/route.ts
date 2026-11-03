import { z } from "zod";
import { body, isoDate, route, uuid } from "@/server/api";
import { logWithNudges } from "@/server/food/screen";

const input = z.object({
  meal: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  /** Past days only; today's logs are timed now. */
  date: isoDate.optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  inputMode: z.enum(["text", "search", "barcode", "saved"]),
  rawText: z.string().max(2000).nullable().optional(),
  model: z.string().max(100).nullable().optional(),
  costUsd: z.number().min(0).max(10).nullable().optional(),
  items: z
    .array(
      z.object({
        foodId: uuid,
        grams: z.number().positive().max(5000),
        estGrams: z.number().positive().max(5000).nullable().optional(),
        confidence: z.number().min(0).max(1).nullable().optional(),
      })
    )
    .min(1)
    .max(40),
});

export const POST = route(async ({ req, userId }) => logWithNudges(userId, await body(req, input)));
