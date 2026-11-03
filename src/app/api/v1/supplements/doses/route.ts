import { z } from "zod";
import { body, isoDate, route, uuid } from "@/server/api";
import { nudgeSummary } from "@/domain/supplements";
import { clearDose, setDose } from "@/server/supplements";

const set = z.object({
  supplementId: uuid,
  status: z.enum(["taken", "half", "skipped"]),
  date: isoDate.optional(),
  late: z.boolean().optional(),
  multiplier: z.number().min(0.5).max(4).optional(),
});

export const POST = route(async ({ req, userId }) => {
  const { supplementId, ...rest } = await body(req, set);
  const r = await setDose(userId, supplementId, { ...rest, late: !!rest.late });
  const summary = nudgeSummary(r.nudges);
  return { nudges: summary ? [summary] : [] };
});

const clear = z.object({ supplementId: uuid, date: isoDate });

/** Undo: the day's record for that supplement is removed. */
export const DELETE = route(async ({ req, userId }) => {
  const { supplementId, date } = await body(req, clear);
  await clearDose(userId, supplementId, date);
  return { ok: true };
});
