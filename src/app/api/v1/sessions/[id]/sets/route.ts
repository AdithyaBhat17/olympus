import { z } from "zod";
import { body, route, uuid } from "@/server/api";
import { logSet, removeSet } from "@/server/sessions";

const logInput = z.object({
  exerciseId: uuid,
  planItemId: uuid.nullable().optional(),
  setIndex: z.number().int().min(0).max(100),
  platesKg: z.number().min(0).max(9999).nullable().optional(),
  weight: z.number().min(0).max(9999).nullable().optional(),
  reps: z.number().int().min(0).max(1000),
  rpe: z.number().min(1).max(10).nullable().optional(),
  type: z.enum(["warmup", "working"]).optional(),
  blockedOverride: z.boolean().optional(),
});

/** Log (or re-log) one set. Returns the stored set and any underload nudge. */
export const POST = route<{ id: string }>(async ({ req, userId, params }) =>
  logSet(userId, uuid.parse(params.id), await body(req, logInput))
);

const removeInput = z.object({ exerciseId: uuid, planItemId: uuid.nullable().optional(), setIndex: z.number().int().min(0) });

/** Remove one logged set (the body says which). */
export const DELETE = route<{ id: string }>(async ({ req, userId, params }) => {
  await removeSet(userId, uuid.parse(params.id), await body(req, removeInput));
});
