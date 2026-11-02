import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { foodLogItems, foodLogs, weighIns } from "@/lib/db/schema";
import { localToUtc } from "@/lib/dates";
import { getProfile } from "../profile";
import { parseMfpMeasurements, parseMfpNutrition } from "./mfp";

export interface MfpImportResult {
  meals: number;
  newMeals: number;
  days: number;
  weighIns: number;
  from: string | null;
  to: string | null;
}

/**
 * Import a MyFitnessPal export: meal totals become food logs (input_mode
 * mfp_import, one item holding the totals), measurements become weigh-ins.
 * Idempotent: each row has a stable external_ref, so re-importing the same
 * or a longer export only adds what's new. Imported history doesn't touch
 * daily check-ins.
 *
 * MFP doesn't record where you were, so times are read in `tz` (default:
 * the athlete's current timezone).
 */
export async function importMfp(
  userId: string,
  files: { nutritionCsv?: string; measurementCsv?: string },
  tz?: string
): Promise<MfpImportResult> {
  const zone = tz ?? (await getProfile(userId)).timezone;
  const meals = files.nutritionCsv ? parseMfpNutrition(files.nutritionCsv) : [];
  const measures = files.measurementCsv ? parseMfpMeasurements(files.measurementCsv) : [];

  let newMeals = 0;
  for (let i = 0; i < meals.length; i += 200) {
    const batch = meals.slice(i, i + 200);
    const inserted = await db
      .insert(foodLogs)
      .values(
        batch.map((m) => ({
          userId,
          eatenAt: localToUtc(m.date, m.time, zone),
          tz: zone,
          localDate: m.date,
          meal: m.meal,
          inputMode: "mfp_import" as const,
          note: m.timeKnown ? `MyFitnessPal ${m.mfpMeal}` : `MyFitnessPal ${m.mfpMeal} (time estimated)`,
          externalRef: m.externalRef,
        }))
      )
      .onConflictDoNothing({ target: [foodLogs.userId, foodLogs.externalRef], where: sql`external_ref IS NOT NULL` })
      .returning({ id: foodLogs.id, ref: foodLogs.externalRef });
    const byRef = new Map(batch.map((m) => [m.externalRef, m]));
    if (inserted.length) {
      await db.insert(foodLogItems).values(
        inserted.map((row) => {
          const m = byRef.get(row.ref!)!;
          return {
            logId: row.id,
            position: 0,
            foodId: null,
            name: `${m.mfpMeal} (MyFitnessPal)`,
            foodSource: "mfp",
            grams: null,
            kcal: m.kcal,
            proteinG: m.protein,
            carbsG: m.carbs,
            fatG: m.fat,
            fibreG: m.fibre,
          };
        })
      );
    }
    newMeals += inserted.length;
  }

  let weighInCount = 0;
  if (measures.length) {
    // MFP measurements carry a date only; read them as an 07:00 morning weigh-in.
    const saved = await db
      .insert(weighIns)
      .values(
        measures.map((m) => ({
          userId,
          source: "mfp" as const,
          measuredAt: localToUtc(m.date, "07:00", zone),
          tz: zone,
          localDate: m.date,
          kg: m.kg,
          bodyFatPct: m.bodyFatPct,
          waistCm: m.waistCm,
          neckCm: m.neckCm,
          hipsCm: m.hipsCm,
        }))
      )
      .onConflictDoNothing()
      .returning({ d: weighIns.localDate });
    weighInCount = saved.length;
  }

  const dates = meals.map((m) => m.date).sort();
  return {
    meals: meals.length,
    newMeals,
    days: new Set(dates).size,
    weighIns: weighInCount,
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
  };
}
