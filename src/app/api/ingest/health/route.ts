import { z } from "zod";
import { todayInTz } from "@/lib/dates";
import { upsertCheckIn } from "@/server/checkins";
import { markIngested, userForIngestToken } from "@/server/integrations/apple-health";

/**
 * Apple Health bridge for an iOS Shortcut (MyFitnessPal → Apple Health →
 * Shortcut → here). Body, one day or several:
 *   { "date": "2026-10-02", "proteinG": 112, "waterMl": 2400 }
 *   { "days": [ { "date": "…", "proteinG": …, "waterL": 2.4, "sleepH": 6.5 } ] }
 * Auth: Authorization: Bearer olh_… (Settings › Connections › Apple Health).
 */

export const runtime = "nodejs";

const day = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}/)
      .refine((d) => {
        const iso = d.slice(0, 10);
        const t = new Date(`${iso}T00:00:00Z`);
        return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso;
      }, "Not a real date")
      .optional(),
    proteinG: z.coerce.number().min(0).max(1000).optional(),
    waterMl: z.coerce.number().min(0).max(20000).optional(),
    waterL: z.coerce.number().min(0).max(20).optional(),
    sleepMin: z.coerce.number().min(0).max(1440).optional(),
    sleepH: z.coerce.number().min(0).max(24).optional(),
  })
  .transform((d) => ({
    date: d.date?.slice(0, 10),
    proteinG: d.proteinG,
    waterMl: d.waterMl ?? (d.waterL != null ? d.waterL * 1000 : undefined),
    sleepMin: d.sleepMin ?? (d.sleepH != null ? d.sleepH * 60 : undefined),
  }));

const body = z.union([z.object({ days: z.array(day).min(1).max(31) }), day]);

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
  const parsed = body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Expected proteinG / waterMl / waterL / sleepMin / sleepH" }, { status: 400 });
  }
  const days = "days" in parsed.data ? parsed.data.days : [parsed.data];

  const saved: Array<{ date: string; proteinG: number | null; waterMl: number | null; sleepMin: number | null }> = [];
  for (const d of days) {
    const date = d.date ?? todayInTz();
    const patch: Record<string, number> = {};
    if (d.proteinG != null) patch.proteinG = d.proteinG;
    if (d.waterMl != null) patch.waterMl = d.waterMl;
    if (d.sleepMin != null) patch.sleepMin = d.sleepMin;
    if (Object.keys(patch).length === 0) continue;
    const row = await upsertCheckIn(userId, date, patch, "apple_health");
    saved.push({ date, proteinG: row.proteinG, waterMl: row.waterMl, sleepMin: row.sleepMin });
  }
  await markIngested(userId);
  return Response.json({ ok: true, saved });
}
