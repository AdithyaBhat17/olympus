import { cronAuthorized } from "@/server/cron-auth";
import { remindersDueAt } from "@/server/supplements";

/**
 * Supplement refill and blood-test reminders, sent at 8am in each user's own
 * timezone. Call it every hour (GitHub Actions: .github/workflows/supplement-reminders.yml);
 * each user is picked only in the hour their local clock reads 8.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const reminders = await remindersDueAt(new Date());
  return Response.json({ ok: reminders.every((r) => !r.error), reminders });
}
