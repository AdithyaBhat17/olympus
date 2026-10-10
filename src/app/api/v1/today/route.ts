import { route } from "@/server/api";
import { todayScreen } from "@/server/screens/today";
import { syncWhoopIfStale } from "@/server/integrations/whoop";

export const GET = route(async ({ userId }) => {
  // Same as the web layout: refresh Whoop if it's been a while, without waiting on failures.
  await syncWhoopIfStale(userId).catch(() => {});
  return todayScreen(userId);
});
