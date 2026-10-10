import { z } from "zod";
import { body, route, uuid } from "@/server/api";
import { updateWorkingWeight } from "@/server/working-weight";

const input = z.object({
  kg: z.number().min(0).max(1000),
  reason: z.string().min(1).max(300),
  force: z.boolean().optional(),
});

/**
 * Set a working weight by hand. A big jump comes back { ok: false, message }
 * (not an error): the app shows it and can resend with force.
 */
export const POST = route<{ id: string }>(async ({ req, userId, params }) => {
  const v = await body(req, input);
  const res = await updateWorkingWeight(userId, { exerciseId: uuid.parse(params.id), ...v }, "user");
  return { ok: res.ok, message: res.message };
});
