import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessionExercises, sessions } from "@/lib/db/schema";
import { listExercises } from "@/server/exercises";
import { resolveSets, workingWeights } from "@/server/history";
import { EXERCISE_CATEGORIES } from "@/lib/constants";
import { formatLoad, progressDelta, topSet } from "@/domain";
import type { ProgressRow } from "@/components/progress/progress-list";

/** The Progress tab: every lift with a working weight and its trend. */
export async function progressScreen(userId: string) {
  const all = await listExercises(userId);
  const byId = new Map(all.map((e) => [e.id, e]));

  const [ww, logRows] = await Promise.all([
    workingWeights(userId, all),
    // Two most recent top sets per exercise, for the trend arrow.
    db
      .select({ sessionId: sessions.id, date: sessions.date, se: sessionExercises })
      .from(sessionExercises)
      .innerJoin(sessions, eq(sessionExercises.sessionId, sessions.id))
      .where(and(eq(sessions.userId, userId), eq(sessions.status, "DONE")))
      .orderBy(desc(sessions.date), desc(sessions.createdAt))
      .limit(2000),
  ]);

  const recentTops = new Map<string, number[]>();
  for (const r of logRows) {
    const ex = byId.get(r.se.exerciseId);
    if (!ex) continue;
    const list = recentTops.get(ex.id) ?? [];
    if (list.length >= 2) continue;
    const top = topSet(ex.loadMode, resolveSets(r.se));
    if (top) list.push(top.weight);
    recentTops.set(ex.id, list);
  }

  const rows: ProgressRow[] = [];
  ww.forEach((w, id) => {
    const ex = byId.get(id);
    if (!ex) return;
    const tops = recentTops.get(id) ?? [];
    // Override newer than the log: compare it with the last logged top set.
    const prev = w.source === "override" ? tops[0] : tops[1];
    const delta = prev != null ? progressDelta(ex.loadMode, prev, w.kg) : 0;
    rows.push({
      id,
      name: ex.name,
      category: ex.category,
      load: formatLoad(ex.loadMode, w.kg),
      unit: ex.loadMode === "TOTAL" ? "kg" : null,
      lastDate: w.date,
      trend: prev == null || delta === 0 ? "flat" : delta > 0 ? "up" : "down",
      trendLabel:
        prev == null
          ? "First logged session"
          : delta === 0
            ? "Same as last session"
            : `${delta > 0 ? "Progressed" : "Eased off"} ${Math.abs(delta)} kg vs last session`,
    });
  });

  const order = new Map<string, number>(EXERCISE_CATEGORIES.map((c, i) => [c, i]));
  rows.sort(
    (a, b) =>
      (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) ||
      a.name.localeCompare(b.name)
  );

  return { eyebrow: `${rows.length} ${rows.length === 1 ? "lift" : "lifts"} tracked`, rows };
}

export type ProgressScreen = Awaited<ReturnType<typeof progressScreen>>;
