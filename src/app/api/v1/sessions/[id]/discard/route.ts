import { route, uuid } from "@/server/api";
import { discardSession } from "@/server/sessions";

/** Throw away a live session. */
export const POST = route<{ id: string }>(async ({ userId, params }) => {
  await discardSession(userId, uuid.parse(params.id));
});
