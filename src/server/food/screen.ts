import "server-only";
import { addDays, localToUtc, tzOffsetMin } from "@/lib/dates";
import { mealForTime, type Meal } from "@/domain/nutrition";
import { nudgeSummary, type Nudge } from "@/domain/supplements";
import { getProfile, todayFor } from "../profile";
import { nudgesFor, setDose, todaySlots, type TodaySlots } from "../supplements";
import { DomainError } from "../errors";
import { foodByBarcode, searchFoods, type FoodSummary } from "./foods";
import { createLog, dayView, weekSummary, type DayView, type NewLog, type WeekDay } from "./logs";
import { recordOutcome } from "./log-text";
import { splitByTime } from "./text-parse";
import { asc, inArray } from "drizzle-orm";
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

/** A supplement named in a describe ("at 9:30 thyroid tablet"): logged as a dose, not a food. */
export interface DescribedDose {
  supplementId: string;
  /** "HH:mm"; null = now (today) or the slot's time (a past day). */
  time?: string | null;
}

/**
 * Log a meal, then the medication-timing note for it, if any.
 *
 * With times in describe, one sheet can hold several meals: items carrying a
 * time ("at 12 coffee with milk") are logged as their own meal at that time,
 * the meal picked from the clock; untimed items keep the sheet's meal and
 * time. Supplements named in the text are logged as doses. Everything is
 * checked before anything is written.
 */
export async function logWithNudges(userId: string, input: NewLog & { doses?: DescribedDose[] }) {
  const doses = input.doses ?? [];
  if (!input.items.length && !doses.length) throw new DomainError("Add at least one food with its weight.");
  const [today, { timezone: tz }] = await Promise.all([todayFor(userId), getProfile(userId)]);
  const date = input.date ?? today;
  const at = (time: string) => localToUtc(date, time, tz);
  for (const t of [...input.items.map((i) => i.time), ...doses.map((d) => d.time)]) {
    if (t && at(t).getTime() > Date.now() + 2 * 60_000) throw new DomainError(`${t} hasn't happened yet. Log it then, or fix the time.`);
  }

  const logs = [];
  for (const g of splitByTime(input.items)) {
    // Timed groups: their own meal at that time. Untimed: the sheet's.
    const timed = g.time ? { date, time: g.time, meal: undefined, eatenAt: undefined } : {};
    logs.push(await createLog(userId, { ...input, ...timed, items: g.items }));
  }

  const nudges: Nudge[] = [];
  for (const d of doses) {
    const r = await setDose(userId, d.supplementId, { date, status: "taken", at: d.time ? at(d.time) : undefined });
    nudges.push(...r.nudges);
  }

  if (input.draftIds?.length) {
    const ids = logs.map((l) => l.id);
    const items = ids.length
      ? await db
          .select({ foodId: foodLogItems.foodId, name: foodLogItems.name, grams: foodLogItems.grams })
          .from(foodLogItems)
          .where(inArray(foodLogItems.logId, ids))
          .orderBy(asc(foodLogItems.position))
      : [];
    await recordOutcome(
      userId,
      input.draftIds,
      logs[0]?.id ?? null,
      items.filter((i) => i.foodId).map((i) => ({ foodId: i.foodId!, name: i.name, grams: i.grams ?? 0 }))
    );
  }
  for (const l of logs) nudges.push(...(await nudgesFor(userId, [`f:${l.id}`], l.eatenAt).catch(() => [])));
  const summary = nudgeSummary(nudges);
  return {
    id: logs[0]?.id ?? null,
    ids: logs.map((l) => l.id),
    date: logs[0]?.date ?? date,
    doses: doses.length,
    nudges: summary ? [summary] : [],
  };
}
