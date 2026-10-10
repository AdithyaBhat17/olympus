import { route, uuid } from "@/server/api";
import { liveSessionScreen } from "@/server/screens/session";
import { deleteSessionFor } from "@/server/manual-log";

/** The live session view plus swap candidates. A DONE session comes back too; the app routes it to the summary. */
export const GET = route<{ id: string }>(async ({ userId, params }) => liveSessionScreen(userId, uuid.parse(params.id)));

/** Delete a session for good (Finish › Export & delete). */
export const DELETE = route<{ id: string }>(async ({ userId, params }) => {
  await deleteSessionFor(userId, uuid.parse(params.id));
});
