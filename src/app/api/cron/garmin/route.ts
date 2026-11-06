import { garminConfigured, garminUserIds, remindKeyExpiry, syncGarmin } from "@/server/integrations/garmin/sync";
import { cronAuthorized } from "@/server/cron-auth";

/**
 * The daily job, called by Vercel Cron (Hobby allows one run a day; app
 * opens fill the gaps): Garmin sync + key-expiry reminders. Supplement
 * reminders have their own hourly route (/api/cron/supplements). Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  if (!garminConfigured()) return Response.json({ ok: true, skipped: "GARMIN_SECRET_KEY not set" });
  const results: Array<{ user: number; ok: boolean; days?: number; activities?: number; reminded?: boolean; error?: string }> = [];
  const users = await garminUserIds();
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
  return Response.json({ ok: results.every((r) => r.ok), results });
}
