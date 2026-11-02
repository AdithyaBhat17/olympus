import { after } from "next/server";
import { route } from "@/server/api";
import { todayScreen } from "@/server/screens/today";
import { syncWhoopIfStale } from "@/server/integrations/whoop";
import { syncGarminIfStale } from "@/server/integrations/garmin/sync";

export const GET = route(async ({ userId }) => {
  // Same as the web layout: refresh devices if it's been a while, without waiting on failures.
  await syncWhoopIfStale(userId).catch(() => {});
  // Garmin takes seconds (spaced API calls, FIT downloads), so it runs after
  // the response; the next refresh shows what it brought in.
  after(() => syncGarminIfStale(userId).catch((err) => console.error("garmin sync", err)));
  return todayScreen(userId);
});
