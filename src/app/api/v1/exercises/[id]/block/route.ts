import { z } from "zod";
import { body, route, uuid } from "@/server/api";
import { setExerciseBlock } from "@/server/exercises";

/** Block an exercise for this athlete ({ reason }), or unblock it ({ reason: null }). */
export const PUT = route<{ id: string }>(async ({ req, userId, params }) => {
  const { reason } = await body(req, z.object({ reason: z.string().max(200).nullable() }));
  await setExerciseBlock(userId, uuid.parse(params.id), reason);
});
