import { z } from "zod";
import { body, isoDate, route } from "@/server/api";
import { nudgeSummary } from "@/domain/supplements";
import { takeSlot } from "@/server/supplements";

const input = z.object({
  slot: z.enum(["waking", "breakfast", "lunch", "pre_workout", "post_workout", "dinner", "bedtime", "any"]),
  date: isoDate.optional(),
  /** When it was taken (ISO 8601 with offset); a queued offline tap carries its own time. */
  at: z.iso.datetime({ offset: true }).optional(),
});

/** Everything still due in a slot, taken now. */
export const POST = route(async ({ req, userId }) => {
  const { slot, date, at } = await body(req, input);
  const r = await takeSlot(userId, slot, date, at ? new Date(at) : undefined);
  const summary = nudgeSummary(r.nudges);
  return { logged: r.logged, nudges: summary ? [summary] : [] };
});
