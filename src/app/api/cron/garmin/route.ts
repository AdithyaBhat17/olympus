import { garminConfigured, garminUserIds, remindKeyExpiry, syncGarmin } from "@/server/integrations/garmin/sync";
import { syncWhoop, whoopConfigured, whoopUserIds } from "@/server/integrations/whoop";
import { cronAuthorized } from "@/server/cron-auth";

/**
 * The daily job, called by Vercel Cron (Hobby allows one run a day; app
 * opens fill the gaps): Garmin sync + key-expiry reminders, and a Whoop
 * sync for anyone with Whoop connected (the fallback when Garmin is off). Supplement
 * reminders have their own hourly route (/api/cron/supplements). Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
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

  // Whoop is independent of Garmin: a lapsed Garmin key must not stop it.
  const whoop: Array<{ user: number; ok: boolean; nights?: number; error?: string }> = [];
  const whoopUsers = whoopConfigured() ? await whoopUserIds() : [];
  for (const [i, userId] of whoopUsers.entries()) {
    try {
      whoop.push({ user: i, ok: true, nights: await syncWhoop(userId, 3) });
    } catch (err) {
      whoop.push({ user: i, ok: false, error: String(err instanceof Error ? err.message : err).slice(0, 200) });
    }
  }
  if (!users.length && !whoopUsers.length) return Response.json({ ok: true, skipped: "nothing connected" });
  return Response.json({ ok: [...results, ...whoop].every((r) => r.ok), results, whoop });
}
