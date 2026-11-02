"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MEALS } from "@/domain/nutrition";
import type { DayLogItem, DayView } from "@/server/food/logs";
import { deleteItemAction, updateItemGramsAction } from "@/app/(app)/food/actions";

const MEAL_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" } as const;

function ItemRow({ item }: { item: DayLogItem }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [grams, setGrams] = useState(String(item.grams ?? ""));
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error((r as { error: string }).error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  return (
    <li className="py-2.5 border-b border-line last:border-0">
      <button type="button" onClick={() => item.grams && setEditing((e) => !e)} className="w-full text-left flex gap-2 items-baseline">
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] leading-snug truncate">{item.name}</span>
          <span className="block text-[12px] text-muted num">
            {item.grams ? `${Math.round(item.grams)} g · ` : ""}
            {Math.round(item.kcal)} kcal · C {Math.round(item.carbs)} · F {Math.round(item.fat)}
          </span>
        </span>
        <span className="num text-[15px] shrink-0">
          {Math.round(item.protein)} g{!item.countsToProtein && <span className="text-muted text-[11px]"> (not counted)</span>}
        </span>
      </button>
      {editing && (
        <div className="flex gap-2 mt-2 items-center">
          <input
            type="number"
            inputMode="decimal"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            aria-label={`Grams of ${item.name}`}
            className="w-24 h-10 px-2 rounded-[10px] bg-surface-2 num text-right"
          />
          <span className="text-[13px] text-muted">g</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => updateItemGramsAction(item.id, Number(grams)))}
            className="h-10 px-3 rounded-[10px] bg-surface-3 text-[13px] font-medium"
          >
            Save
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => deleteItemAction(item.id))}
            className="h-10 px-3 rounded-[10px] bg-surface-3 text-[13px] font-medium text-danger-soft ml-auto"
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

/** Meals in order, with per-meal protein so the day's feedings are visible. */
export function MealList({ view }: { view: DayView }) {
  if (!view.logs.length) {
    return (
      <p className="mx-5 mt-6 text-[15px] text-muted">
        Nothing logged yet. Tap <span className="text-fg">Log food</span> and describe it, search, or enter a barcode.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 mt-3">
      {MEALS.map((meal) => {
        const logs = view.logs.filter((l) => l.meal === meal);
        if (!logs.length) return null;
        const items = logs.flatMap((l) => l.items);
        return (
          <section key={meal} className="card mx-3 px-4 pt-3 pb-1" aria-labelledby={`meal-${meal}`}>
            <div className="flex items-baseline justify-between">
              <h2 id={`meal-${meal}`} className="m-0 text-[15px] font-semibold">
                {MEAL_LABEL[meal]}
              </h2>
              <span className="text-[13px] text-muted num">
                {view.byMeal[meal].kcal} kcal · <span className="text-fg">{Math.round(view.byMeal[meal].protein)} g protein</span>
              </span>
            </div>
            <ul className="m-0 p-0 list-none">
              {items.map((i) => (
                <ItemRow key={i.id} item={i} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
