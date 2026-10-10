import { route } from "@/server/api";
import { revokeAllForUser } from "@/server/oauth";

/** Disconnect Claude (every connector token). The app's own sign-in stays. */
export const DELETE = route(async ({ userId }) => {
  await revokeAllForUser(userId);
});
