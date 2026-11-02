import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { foodLogItems, foodLogs, type FoodInputMode } from "@/lib/db/schema";
import { isoDateInTz, localToUtc, tzOffsetMin } from "@/lib/dates";
import { dayTotals, forGrams, mealForTime, remaining, type DayTotals, type Meal, type Remaining } from "@/domain/nutrition";
import { upsertCheckIn } from "../checkins";
import { DomainError } from "../errors";
import { getProfile } from "../profile";
import { getFoodsByIds, per100 } from "./foods";

/**
 * Food logging. A log is one meal entry; its items snapshot their nutrients
 * from the food row at log time. After any change the day's protein (toward
 * the floor) is written to the daily check-in as source "food_log".
 */

export interface NewItem {
  foodId: string;
  grams: number;
  /** What a parser or model proposed, before the athlete edited it. */
  estGrams?: number | null;
  confidence?: number | null;
}

export interface NewLog {
  meal?: Meal;
  /** Defaults to now. */
  eatenAt?: Date;
  /** Or a local date + "HH:mm" in the athlete's timezone. */
  date?: string;
  time?: string;
  inputMode: FoodInputMode;
  rawText?: string | null;
  model?: string | null;
  costUsd?: number | null;
  items: NewItem[];
}

/** Collagen protein stays off the protein floor unless the athlete opts in. */
function countsToProtein(food: { name: string; tags: string[] }, collagenCounts: boolean): boolean {
  if (collagenCounts) return true;
  return !(food.tags.includes("collagen") || /\bcollagen\b/i.test(food.name));
}

export async function createLog(userId: string, input: NewLog): Promise<{ id: string; date: string }> {
  const items = input.items.filter((i) => i.grams > 0);
  if (!items.length) throw new DomainError("Add at least one food with its weight.");
  if (items.some((i) => i.grams > 5000)) throw new DomainError("That's over 5 kg of one food. Check the grams.");
  const profile = await getProfile(userId);
  const tz = profile.timezone;
  const eatenAt = input.date && input.time ? localToUtc(input.date, input.time, tz) : (input.eatenAt ?? new Date());
  const localDate = isoDateInTz(eatenAt, tz);
  const localMin = (((eatenAt.getTime() / 60_000 + tzOffsetMin(eatenAt, tz)) % 1440) + 1440) % 1440;
  const meal = input.meal ?? mealForTime(localMin);

  const byId = await getFoodsByIds(userId, [...new Set(items.map((i) => i.foodId))]);
  for (const i of items) if (!byId.has(i.foodId)) throw new DomainError("One of those foods doesn't exist.");

  const [log] = await db
    .insert(foodLogs)
    .values({
      userId,
      eatenAt,
      tz,
      localDate,
      meal,
      inputMode: input.inputMode,
      rawText: input.rawText?.slice(0, 2000) ?? null,
      model: input.model ?? null,
      costUsd: input.costUsd ?? null,
    })
    .returning({ id: foodLogs.id });
  await db.insert(foodLogItems).values(
    items.map((i, position) => {
      const f = byId.get(i.foodId)!;
      const m = forGrams(per100(f), i.grams);
      return {
        logId: log.id,
        position,
        foodId: f.id,
        name: f.name,
        foodSource: f.source,
        grams: Math.round(i.grams * 10) / 10,
        kcal: m.kcal,
        proteinG: m.protein,
        carbsG: m.carbs,
        fatG: m.fat,
        fibreG: m.fibre,
        countsToProtein: countsToProtein(f, profile.collagenCountsToProtein),
        estGrams: i.estGrams ?? null,
        confidence: i.confidence ?? null,
      };
    })
  );
  await syncProteinCheckIn(userId, localDate);
  return { id: log.id, date: localDate };
}

async function ownLog(userId: string, logId: string) {
  const [log] = await db
    .select({ id: foodLogs.id, localDate: foodLogs.localDate })
    .from(foodLogs)
    .where(and(eq(foodLogs.id, logId), eq(foodLogs.userId, userId)));
  if (!log) throw new DomainError("That entry doesn't exist.");
  return log;
}

export async function deleteLog(userId: string, logId: string): Promise<void> {
  const log = await ownLog(userId, logId);
  await db.delete(foodLogs).where(eq(foodLogs.id, log.id));
  await syncProteinCheckIn(userId, log.localDate);
}

/** Change an item's grams; nutrients rescale from its snapshot (or the food). */
export async function updateItemGrams(userId: string, itemId: string, grams: number): Promise<void> {
  if (!(grams > 0 && grams <= 5000)) throw new DomainError("Grams must be between 0 and 5000.");
  const [item] = await db
    .select({ item: foodLogItems, userId: foodLogs.userId, localDate: foodLogs.localDate })
    .from(foodLogItems)
    .innerJoin(foodLogs, eq(foodLogs.id, foodLogItems.logId))
    .where(eq(foodLogItems.id, itemId));
  if (!item || item.userId !== userId) throw new DomainError("That item doesn't exist.");
  const old = item.item;
  if (!old.grams) throw new DomainError("Imported meal totals can't be re-weighed.");
  const k = grams / old.grams;
  const r1 = (n: number) => Math.round(n * k * 10) / 10;
  await db
    .update(foodLogItems)
    .set({
      grams,
      kcal: r1(old.kcal),
      proteinG: r1(old.proteinG),
      carbsG: r1(old.carbsG),
      fatG: r1(old.fatG),
      fibreG: r1(old.fibreG),
      // Keep the first estimate so corrections can teach usual portions.
      estGrams: old.estGrams ?? old.grams,
    })
    .where(eq(foodLogItems.id, itemId));
  await syncProteinCheckIn(userId, item.localDate);
}

export async function deleteItem(userId: string, itemId: string): Promise<void> {
  const [item] = await db
    .select({ logId: foodLogItems.logId, userId: foodLogs.userId, localDate: foodLogs.localDate })
    .from(foodLogItems)
    .innerJoin(foodLogs, eq(foodLogs.id, foodLogItems.logId))
    .where(eq(foodLogItems.id, itemId));
  if (!item || item.userId !== userId) throw new DomainError("That item doesn't exist.");
  await db.delete(foodLogItems).where(eq(foodLogItems.id, itemId));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(foodLogItems).where(eq(foodLogItems.logId, item.logId));
  if (n === 0) await db.delete(foodLogs).where(eq(foodLogs.id, item.logId));
  await syncProteinCheckIn(userId, item.localDate);
}

/** Write the day's counted protein to the check-in (source food_log). */
export async function syncProteinCheckIn(userId: string, date: string): Promise<void> {
  const rows = await db
    .select({ protein: foodLogItems.proteinG, counts: foodLogItems.countsToProtein, mode: foodLogs.inputMode })
    .from(foodLogItems)
    .innerJoin(foodLogs, eq(foodLogs.id, foodLogItems.logId))
    .where(and(eq(foodLogs.userId, userId), eq(foodLogs.localDate, date)));
  // Imported MyFitnessPal history stays history: it doesn't rewrite old check-ins.
  const live = rows.filter((r) => r.mode !== "mfp_import");
  if (!live.length) return;
  // Same rounding as the Food page (1 decimal, then whole grams), so they agree.
  const protein = Math.round(live.reduce((s, r) => s + (r.counts ? r.protein : 0), 0) * 10) / 10;
  await upsertCheckIn(userId, date, { proteinG: Math.round(protein) }, "food_log");
}

export interface DayLogItem {
  id: string;
  foodId: string | null;
  name: string;
  source: string;
  grams: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  countsToProtein: boolean;
}

export interface DayLog {
  id: string;
  meal: Meal;
  eatenAt: string;
  inputMode: FoodInputMode;
  items: DayLogItem[];
  totals: { kcal: number; protein: number };
}

export interface DayView {
  date: string;
  logs: DayLog[];
  byMeal: Record<Meal, { kcal: number; protein: number }>;
  totals: DayTotals;
  remaining: Remaining;
  targets: { kcal: number | null; protein: number | null };
}

export async function dayView(userId: string, date: string): Promise<DayView> {
  const profile = await getProfile(userId);
  const logs = await db
    .select()
    .from(foodLogs)
    .where(and(eq(foodLogs.userId, userId), eq(foodLogs.localDate, date)))
    .orderBy(asc(foodLogs.eatenAt));
  const items = logs.length
    ? await db
        .select()
        .from(foodLogItems)
        .where(inArray(foodLogItems.logId, logs.map((l) => l.id)))
        .orderBy(asc(foodLogItems.position))
    : [];
  const out: DayLog[] = logs.map((l) => {
    const its = items
      .filter((i) => i.logId === l.id)
      .map((i) => ({
        id: i.id,
        foodId: i.foodId,
        name: i.name,
        source: i.foodSource,
        grams: i.grams,
        kcal: i.kcal,
        protein: i.proteinG,
        carbs: i.carbsG,
        fat: i.fatG,
        fibre: i.fibreG,
        countsToProtein: i.countsToProtein,
      }));
    return {
      id: l.id,
      meal: l.meal,
      eatenAt: l.eatenAt.toISOString(),
      inputMode: l.inputMode,
      items: its,
      totals: {
        kcal: Math.round(its.reduce((s, i) => s + i.kcal, 0)),
        protein: Math.round(its.reduce((s, i) => s + (i.countsToProtein ? i.protein : 0), 0) * 10) / 10,
      },
    };
  });
  const all = out.flatMap((l) => l.items);
  const totals = dayTotals(all);
  const byMeal = { breakfast: { kcal: 0, protein: 0 }, lunch: { kcal: 0, protein: 0 }, dinner: { kcal: 0, protein: 0 }, snack: { kcal: 0, protein: 0 } };
  for (const l of out) {
    byMeal[l.meal].kcal += l.totals.kcal;
    byMeal[l.meal].protein = Math.round((byMeal[l.meal].protein + l.totals.protein) * 10) / 10;
  }
  const targets = { kcal: profile.targets.kcal, protein: profile.targets.proteinG };
  return {
    date,
    logs: out,
    byMeal,
    totals,
    remaining: remaining(totals, { kcalTarget: targets.kcal, proteinTarget: targets.protein }),
    targets,
  };
}
