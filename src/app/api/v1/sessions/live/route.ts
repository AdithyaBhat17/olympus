import { route } from "@/server/api";
import { getLiveSession } from "@/server/sessions";

/** The session in progress, if any. */
export const GET = route(async ({ userId }) => {
  const live = await getLiveSession(userId);
  return { id: live?.id ?? null };
});
