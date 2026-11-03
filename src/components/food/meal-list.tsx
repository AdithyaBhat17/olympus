"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { hapticTick } from "@/lib/haptics";
import { MEALS, type Meal } from "@/domain/nutrition";
import type { DayLogItem, DayView } from "@/server/food/logs";
import { deleteItemAction, updateItemGramsAction } from "@/app/(app)/food/actions";
import { useOpenLog } from "./log-context";

export const MEAL_LABEL: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" };

function PlusIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** MFP history arrives as one total per meal; say so instead of "Lunch (MyFitnessPal)". */
function display(item: DayLogItem) {
  if (item.source === "mfp") return { name: "From MyFitnessPal", sub: `Meal total · ${Math.round(item.kcal)} kcal` };
  const g = item.grams ? `${Math.round(item.grams)} g · ` : "";
  return { name: item.name, sub: `${g}${Math.round(item.kcal)} kcal` };
}

function ItemRow({ item }: { item: DayLogItem }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [grams, setGrams] = useState(item.grams ?? 0);
  const [pending, start] = useTransition();
  const editable = item.grams != null && item.source !== "mfp";
  const { name, sub } = display(item);
  const scaled = item.grams ? grams / item.grams : 1;

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error((r as { error: string }).error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  const step = (d: number) => {
    hapticTick();
    setGrams((g) => Math.max(5, Math.round((g + d) / 5) * 5));
  };

  return (
    <li className={cn("border-t border-line first:border-t-0 transition-colors", editing && "bg-surface-2")}>
      <button
        type="button"
        disabled={!editable}
        aria-expanded={editable ? editing : undefined}
        onClick={() => {
          setGrams(item.grams ?? 0);
          setEditing((e) => !e);
        }}
        className="press-soft w-full text-left flex items-center gap-3 px-5 py-3 disabled:cursor-default"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-[16px] font-semibold leading-snug truncate">{name}</span>
          <span className="block text-[13px] text-muted tabular-nums mt-0.5">{sub}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className={cn("num text-[17px]", !item.countsToProtein && "text-muted")}>{Math.round(item.protein)}</span>
          <span className="text-[13px] font-semibold text-muted"> g</span>
          {!item.countsToProtein && <span className="block text-[11px] font-semibold text-muted">not counted</span>}
        </span>
      </button>

      {editing && (
        <div className="px-5 pb-4 flex items-center gap-2 animate-fade-in">
          <div className="flex items-center h-11 rounded-full bg-bg">
            <button type="button" onClick={() => step(-10)} aria-label="10 g less" className="w-11 h-11 rounded-full flex items-center justify-center text-fg-2">
              <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
                <path d="M5 12h14" />
              </svg>
            </button>
            <label className="flex items-baseline">
              <span className="sr-only">Grams of {item.name}</span>
              <input
                type="number"
                inputMode="decimal"
                value={grams || ""}
                onChange={(e) => setGrams(Math.max(0, Number(e.target.value) || 0))}
                className="w-14 bg-transparent num text-[17px] text-center focus:outline-none"
              />
              <span className="text-[13px] font-semibold text-muted -ml-1">g</span>
            </label>
            <button type="button" onClick={() => step(10)} aria-label="10 g more" className="w-11 h-11 rounded-full flex items-center justify-center text-fg-2">
              <PlusIcon size={16} />
            </button>
          </div>
          <span className="text-[13px] text-muted tabular-nums truncate">
            {Math.round(item.protein * scaled)} g protein · {Math.round(item.kcal * scaled)} kcal
          </span>
          <div className="ml-auto flex gap-1.5 shrink-0">
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => deleteItemAction(item.id))}
              aria-label={`Delete ${item.name}`}
              className="w-11 h-11 rounded-full bg-bg text-danger flex items-center justify-center"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5" />
              </svg>
            </button>
            <button
              type="button"
              disabled={pending || !grams || grams === item.grams}
              onClick={() => act(() => updateItemGramsAction(item.id, grams))}
              className="h-11 px-4 rounded-full bg-fg text-bg text-[15px] font-bold disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function MealCard({ meal, view }: { meal: Meal; view: DayView }) {
  const open = useOpenLog();
  const logs = view.logs.filter((l) => l.meal === meal);
  const items = logs.flatMap((l) => l.items);
  const totals = view.byMeal[meal];
  const add = () => {
    hapticTick();
    open({ meal, tab: "describe" });
  };

  if (!items.length) {
    return (
      <button
        type="button"
        onClick={add}
        className="press-soft w-full flex items-center gap-3 rounded-[24px] bg-surface/60 pl-5 pr-2 h-14 text-left"
      >
        <span className="flex-1 text-[17px] font-bold text-fg-2">{MEAL_LABEL[meal]}</span>
        <span className="text-[13px] text-faint">Nothing yet</span>
        <span className="w-10 h-10 rounded-full bg-surface-2 text-fg flex items-center justify-center" aria-hidden="true">
          <PlusIcon />
        </span>
        <span className="sr-only">Add to {MEAL_LABEL[meal]}</span>
      </button>
    );
  }

  return (
    <section aria-labelledby={`meal-${meal}`} className="rounded-[28px] bg-surface overflow-hidden">
      <header className="flex items-center gap-3 pl-5 pr-2 pt-2 pb-1">
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <h2 id={`meal-${meal}`} className="m-0 text-[17px] font-extrabold">
            {MEAL_LABEL[meal]}
          </h2>
          {logs[0].inputMode !== "mfp_import" && <span className="text-[13px] font-semibold text-muted tabular-nums">{logs[0].time}</span>}
        </div>
        <span className="text-right leading-tight">
          <span className="num text-[17px] text-accent">{Math.round(totals.protein)}</span>
          <span className="text-[13px] font-bold text-accent"> g</span>
          <span className="text-[13px] text-muted tabular-nums"> · {totals.kcal.toLocaleString("en-GB")} kcal</span>
        </span>
        <button type="button" onClick={add} aria-label={`Add to ${MEAL_LABEL[meal]}`} className="w-10 h-10 my-1 rounded-full flex items-center justify-center text-fg-2">
          <PlusIcon />
        </button>
      </header>
      <ul className="m-0 p-0 list-none">
        {items.map((i) => (
          <ItemRow key={i.id} item={i} />
        ))}
      </ul>
    </section>
  );
}

/** All four meals, always: where you'd log next is never hidden. */
export function MealList({ view }: { view: DayView }) {
  return (
    <div className="flex flex-col gap-2.5 mx-4 arrive arrive-3">
      {MEALS.map((meal) => (
        <MealCard key={meal} meal={meal} view={view} />
      ))}
    </div>
  );
}
