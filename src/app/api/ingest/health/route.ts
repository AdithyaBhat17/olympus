import { healthIngestBody, ingestHealthDays, userForIngestToken } from "@/server/integrations/apple-health";

/**
 * Apple Health bridge for an iOS Shortcut (MyFitnessPal → Apple Health →
 * here). The iOS app posts the same body to /api/v1/health with its own
 * sign-in instead. Body, one day or several:
 *   { "date": "2026-10-02", "proteinG": 112, "waterMl": 2400 }
 *   { "days": [ { "date": "…", "proteinG": …, "waterL": 2.4, "sleepH": 6.5, "hrvMs": 48, "restingHr": 55 } ] }
 * hrvMs is Apple Health's SDNN.
 * Auth: Authorization: Bearer olh_… (Settings › Connections › Apple Health).
 */

export const runtime = "nodejs";

export async function POST(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const raw = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const userId = raw ? await userForIngestToken(raw) : null;
  if (!userId) return Response.json({ ok: false, error: "Invalid token" }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
  }
  const parsed = healthIngestBody.safeParse(json);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Expected proteinG / waterMl / waterL / sleepMin / sleepH / hrvMs / restingHr" }, { status: 400 });
  }
  return Response.json({ ok: true, saved: await ingestHealthDays(userId, parsed.data) });
}
