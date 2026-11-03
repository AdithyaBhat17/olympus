import Link from "next/link";
import { requireUserEmail } from "@/lib/auth";
import { addDays, formatDayShort, tzOffsetMin } from "@/lib/dates";
import { mealForTime } from "@/domain/nutrition";
import { todayFor, getProfile } from "@/server/profile";
import { dayView, weekSummary } from "@/server/food/logs";
import { todaySlots } from "@/server/supplements";
import { PageHeader } from "@/components/page-header";
import { WeekStrip } from "@/components/food/week-strip";
import { ProteinHero } from "@/components/food/protein-hero";
import { MealList } from "@/components/food/meal-list";
import { LogProvider } from "@/components/food/log-context";
import { ComposerDock } from "@/components/food/composer-dock";
import { SlotCard } from "@/components/supplements/slot-card";

export const metadata = { title: "Food" };

export default async function FoodPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const userId = await requireUserEmail();
  const [today, profile, sp] = await Promise.all([todayFor(userId), getProfile(userId), searchParams]);
  const date = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) && sp.d <= today ? sp.d : today;
  // The strip ends on today while the day is in this week, else a few days after it.
  const weekEnd = addDays(date, 3) < today ? addDays(date, 3) : today;
  const [view, slots, week] = await Promise.all([dayView(userId, date), todaySlots(userId, date), weekSummary(userId, weekEnd)]);
  const isToday = date === today;
  const now = new Date();
  const localMin = Math.floor((((now.getTime() / 60_000 + tzOffsetMin(now, profile.timezone)) % 1440) + 1440) % 1440);

  return (
    <LogProvider date={date} isToday={isToday} defaultMeal={isToday ? mealForTime(localMin) : "lunch"}>
      <div className="pb-[calc(env(safe-area-inset-bottom,0px)+200px)]">
        <PageHeader
          eyebrow={isToday ? `Today, ${formatDayShort(date)}` : formatDayShort(date)}
          title="Food"
          action={
            <Link href="/food/recipes" aria-label="My foods and recipes" className="btn-round">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 4.5h11a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3z" />
                <path d="M5 16.5a3 3 0 0 1 3-3h11M9 8.5h6" />
              </svg>
            </Link>
          }
        />
        <WeekStrip days={week} selected={date} today={today} target={view.targets.protein} />
        <ProteinHero view={view} />
        {slots.slots.length > 0 && (
          <div className="mt-6">
            <SlotCard data={slots} compact />
          </div>
        )}
        <h2 className="section-label mx-5 mt-7 mb-3">Meals</h2>
        <MealList view={view} />
      </div>
      <ComposerDock />
    </LogProvider>
  );
}
