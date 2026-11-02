import Link from "next/link";
import { requireUserEmail } from "@/lib/auth";
import { addDays, formatDayShort, tzOffsetMin } from "@/lib/dates";
import { mealForTime } from "@/domain/nutrition";
import { todayFor, getProfile } from "@/server/profile";
import { dayView } from "@/server/food/logs";
import { PageHeader } from "@/components/page-header";
import { DaySummary } from "@/components/food/day-summary";
import { MealList } from "@/components/food/meal-list";
import { LogButton } from "@/components/food/log-button";

export const metadata = { title: "Food" };

export default async function FoodPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const userId = await requireUserEmail();
  const [today, profile, sp] = await Promise.all([todayFor(userId), getProfile(userId), searchParams]);
  const date = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) && sp.d <= today ? sp.d : today;
  const view = await dayView(userId, date);
  const isToday = date === today;
  const now = new Date();
  const localMin = Math.floor((((now.getTime() / 60_000 + tzOffsetMin(now, profile.timezone)) % 1440) + 1440) % 1440);

  return (
    <div className="pb-24">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-3">
            <Link href={`/food?d=${addDays(date, -1)}`} aria-label="Previous day" className="text-fg-2 px-1">
              ‹
            </Link>
            <span>{isToday ? `Today, ${formatDayShort(date)}` : formatDayShort(date)}</span>
            {!isToday && (
              <Link href={`/food?d=${addDays(date, 1)}`} aria-label="Next day" className="text-fg-2 px-1">
                ›
              </Link>
            )}
          </span>
        }
        title="Food"
        action={
          <Link href="/food/recipes" className="h-11 px-3.5 rounded-full bg-surface-2 text-[14px] font-medium flex items-center">
            My foods
          </Link>
        }
      />
      <DaySummary view={view} />
      <MealList view={view} />
      <LogButton date={date} isToday={isToday} defaultMeal={isToday ? mealForTime(localMin) : "lunch"} />
    </div>
  );
}
