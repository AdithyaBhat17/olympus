import { z } from "zod";
import { body, route, uuid } from "@/server/api";
import { swapExercise } from "@/server/sessions";

const input = z.object({
  planItemId: uuid,
  exerciseId: uuid,
  overrideReason: z.string().max(300).nullable().optional(),
});

/** Swap a planned exercise. A blocked target needs overrideReason (it's flagged for the PT). */
export const POST = route<{ id: string }>(async ({ req, userId, params }) => {
  const v = await body(req, input);
  await swapExercise(userId, uuid.parse(params.id), {
    planItemId: v.planItemId,
    exerciseRef: v.exerciseId,
    overrideReason: v.overrideReason,
  });
});
