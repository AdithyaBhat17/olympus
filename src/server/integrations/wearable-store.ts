import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyWearable } from "@/lib/db/schema";

export type WearableColumn = Exclude<keyof typeof dailyWearable.$inferInsert, "userId" | "date" | "source" | "updatedAt">;

/**
 * Upserts one daily_wearable row per date for `source`, 50 at a time.
 *
 * - "replace": the row is rewritten whole, so a value the device stopped
 *   reporting is cleared. Only safe when the sync read every record for each date.
 * - "merge": a column the sync has no value for keeps what's stored. For
 *   windows that can cut a night in half (e.g. a nap in range, its night not).
 */
export async function upsertWearableDays(
  userId: string,
  source: "garmin" | "whoop",
  columns: readonly WearableColumn[],
  days: Iterable<[string, object]>,
  mode: "replace" | "merge"
): Promise<void> {
  const rows = Array.from(days, ([date, d]) => {
    const row: Record<string, unknown> = { userId, date, source, updatedAt: new Date() };
    for (const c of columns) row[c] = (d as Record<string, unknown>)[c] ?? null;
    return row as typeof dailyWearable.$inferInsert;
  });
  const set: Record<string, unknown> = { updatedAt: sql`now()` };
  for (const c of columns) {
    const name = dailyWearable[c].name;
    set[c] = mode === "merge" ? sql.raw(`coalesce(excluded.${name}, daily_wearable.${name})`) : sql.raw(`excluded.${name}`);
  }
  for (let i = 0; i < rows.length; i += 50) {
    await db
      .insert(dailyWearable)
      .values(rows.slice(i, i + 50))
      .onConflictDoUpdate({ target: [dailyWearable.userId, dailyWearable.date, dailyWearable.source], set });
  }
}
