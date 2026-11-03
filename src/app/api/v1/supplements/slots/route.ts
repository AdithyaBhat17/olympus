import { z } from "zod";
import { body, isoDate, route } from "@/server/api";
import { nudgeSummary } from "@/domain/supplements";
import { takeSlot } from "@/server/supplements";

const input = z.object({
  slot: z.enum(["waking", "breakfast", "lunch", "pre_workout", "post_workout", "dinner", "bedtime", "any"]),
  date: isoDate.optional(),
});

/** Everything still due in a slot, taken now. */
export const POST = route(async ({ req, userId }) => {
  const { slot, date } = await body(req, input);
  const r = await takeSlot(userId, slot, date);
  const summary = nudgeSummary(r.nudges);
  return { logged: r.logged, nudges: summary ? [summary] : [] };
});
