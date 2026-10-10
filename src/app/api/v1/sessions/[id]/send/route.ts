import { z } from "zod";
import { body, route, uuid } from "@/server/api";
import { sendToPT } from "@/server/sessions";

/** "Send to PT": marks the session DONE (if live) and stamps sentAt. */
export const POST = route<{ id: string }>(async ({ req, userId, params }) => {
  const { notes } = await body(req, z.object({ notes: z.string().max(2000).nullable() }));
  await sendToPT(userId, uuid.parse(params.id), notes);
});
