import { garminConfigured, garminUserIds, remindKeyExpiry, syncGarmin } from "@/server/integrations/garmin/sync";
import { syncWhoopForCron, whoopConfigured, whoopUserIds } from "@/server/integrations/whoop";
import { cronAuthorized } from "@/server/cron-auth";

/**
 * The daily job, called by Vercel Cron (Hobby allows one run a day; app
 * opens fill the gaps): Garmin sync + key-expiry reminders, and a Whoop sync
 * for anyone with Whoop connected (the fallback when Garmin is off). The two
 * run side by side so a slow Garmin run can't use up the time Whoop needs, and
 * a lapsed Garmin key can't stop Whoop. Supplement reminders have their own
 * hourly route (/api/cron/supplements). Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function runGarmin() {
  const results: Array<{ user: number; ok: boolean; days?: number; activities?: number; reminded?: boolean; error?: string }> = [];
  const users = garminConfigured() ? await garminUserIds() : [];
  for (const [i, userId] of users.entries()) {
    try {
      const r = await syncGarmin(userId);
      const reminded = await remindKeyExpiry(userId).catch(() => false);
      results.push({ user: i, ok: true, days: r?.days, activities: r?.activities, reminded });
    } catch (err) {
      // Reminders still go out when the sync fails: an expired key is the usual cause.
      await remindKeyExpiry(userId).catch(() => false);
      results.push({ user: i, ok: false, error: String(err instanceof Error ? err.message : err).slice(0, 200) });
    }
  }
  return results;
}

async function runWhoop() {
  const results: Array<{ user: number; ok: boolean; nights?: number | null; error?: string }> = [];
  const users = whoopConfigured() ? await whoopUserIds() : [];
  for (const [i, userId] of users.entries()) {
    try {
      results.push({ user: i, ok: true, nights: await syncWhoopForCron(userId) });
    } catch (err) {
      results.push({ user: i, ok: false, error: String(err instanceof Error ? err.message : err).slice(0, 200) });
    }
  }
  return results;
}

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const [results, whoop] = await Promise.all([runGarmin(), runWhoop()]);
  if (!results.length && !whoop.length) return Response.json({ ok: true, skipped: "nothing connected" });
  return Response.json({ ok: [...results, ...whoop].every((r) => r.ok), results, whoop });
}
