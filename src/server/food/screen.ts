import "server-only";
import { addDays, tzOffsetMin } from "@/lib/dates";
import { mealForTime, type Meal } from "@/domain/nutrition";
import { nudgeSummary } from "@/domain/supplements";
import { getProfile, todayFor } from "../profile";
import { nudgesFor, todaySlots, type TodaySlots } from "../supplements";
import { DomainError } from "../errors";
import { foodByBarcode, searchFoods, type FoodSummary } from "./foods";
import { createLog, dayView, weekSummary, type DayView, type NewLog, type WeekDay } from "./logs";
import { recordOutcome } from "./log-text";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { foodLogItems } from "@/lib/db/schema";

/**
 * Everything the Food screen shows, in one call: web page and iOS app read
 * the same thing, so the two never disagree about a day.
 */
export interface FoodScreen {
  date: string;
  today: string;
  isToday: boolean;
  /** The meal a new log goes to by default: by the clock today, lunch on a past day. */
  defaultMeal: Meal;
  view: DayView;
  week: WeekDay[];
  slots: TodaySlots;
}

export async function foodScreen(userId: string, requested?: string): Promise<FoodScreen> {
  const [today, profile] = await Promise.all([todayFor(userId), getProfile(userId)]);
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today;
  // The strip ends on today while the day is in this week, else a few days after it.
  const weekEnd = addDays(date, 3) < today ? addDays(date, 3) : today;
  const [view, slots, week] = await Promise.all([dayView(userId, date), todaySlots(userId, date), weekSummary(userId, weekEnd)]);
  const isToday = date === today;
  const now = new Date();
  const localMin = Math.floor((((now.getTime() / 60_000 + tzOffsetMin(now, profile.timezone)) % 1440) + 1440) % 1440);
  return { date, today, isToday, defaultMeal: isToday ? mealForTime(localMin) : "lunch", view, week, slots };
}

/** A barcode as a search-style summary (with favourite and habit), or a DomainError. */
export async function barcodeSummary(userId: string, code: string): Promise<FoodSummary> {
  const food = await foodByBarcode(code);
  if (!food) throw new DomainError("Not found on Open Food Facts. Add it from the label instead.");
  const hits = await searchFoods(userId, food.name, 10);
  return (
    hits.find((h) => h.id === food.id) ?? {
      id: food.id,
      name: food.name,
      brand: food.brand,
      source: food.source,
      kcal100g: food.kcal100g,
      protein100g: food.protein100g,
      carbs100g: food.carbs100g,
      fat100g: food.fat100g,
      fibre100g: food.fibre100g,
      servingG: food.servingG,
      servingLabel: food.servingLabel,
      verified: food.verified,
      favourite: false,
      timesLogged: 0,
    }
  );
}

/** Log a meal, then the medication-timing note for it, if any. */
export async function logWithNudges(userId: string, input: NewLog) {
  const log = await createLog(userId, input);
  if (input.draftIds?.length) {
    const items = await db
      .select({ foodId: foodLogItems.foodId, name: foodLogItems.name, grams: foodLogItems.grams })
      .from(foodLogItems)
      .where(eq(foodLogItems.logId, log.id))
      .orderBy(asc(foodLogItems.position));
    await recordOutcome(
      userId,
      input.draftIds,
      log.id,
      items.filter((i) => i.foodId).map((i) => ({ foodId: i.foodId!, name: i.name, grams: i.grams ?? 0 }))
    );
  }
  const nudges = await nudgesFor(userId, [`f:${log.id}`], log.eatenAt).catch(() => []);
  const summary = nudgeSummary(nudges);
  return { ...log, nudges: summary ? [summary] : [] };
}
