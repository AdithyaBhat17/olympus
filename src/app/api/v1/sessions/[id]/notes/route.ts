import { z } from "zod";
import { body, route, uuid } from "@/server/api";
import { saveSessionNotes } from "@/server/sessions";

/** Replace the session notes (the whole text, so replays are safe). */
export const PUT = route<{ id: string }>(async ({ req, userId, params }) => {
  const { notes } = await body(req, z.object({ notes: z.string().max(2000).nullable() }));
  await saveSessionNotes(userId, uuid.parse(params.id), notes);
});
