import { z } from "zod";
import { body, route, uuid } from "@/server/api";
import { finishSession } from "@/server/sessions";

/** Finish without sending. Needs at least one logged set. */
export const POST = route<{ id: string }>(async ({ req, userId, params }) => {
  const { notes } = await body(req, z.object({ notes: z.string().max(2000).nullable() }));
  await finishSession(userId, uuid.parse(params.id), notes);
});
