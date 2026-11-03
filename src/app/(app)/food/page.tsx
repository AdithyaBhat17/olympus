import Link from "next/link";
import { requireUserEmail } from "@/lib/auth";
import { formatDayShort } from "@/lib/dates";
import { foodScreen } from "@/server/food/screen";
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
  const { d } = await searchParams;
  const { date, today, isToday, defaultMeal, view, week, slots } = await foodScreen(userId, d);

  return (
    <LogProvider date={date} isToday={isToday} defaultMeal={defaultMeal}>
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
