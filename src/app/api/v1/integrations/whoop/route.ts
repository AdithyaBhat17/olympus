import { route } from "@/server/api";
import { disconnectWhoop, syncWhoop } from "@/server/integrations/whoop";

/** Sync the last 14 nights now. Returns how many nights came back. */
export const POST = route(async ({ userId }) => ({ nights: await syncWhoop(userId, 14) }));

export const DELETE = route(async ({ userId }) => {
  await disconnectWhoop(userId);
});
