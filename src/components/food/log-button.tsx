"use client";

import { useState } from "react";
import type { Meal } from "@/domain/nutrition";
import { LogSheet } from "./log-sheet";

export function LogButton({ date, isToday, defaultMeal }: { date: string; isToday: boolean; defaultMeal: Meal }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed z-30 right-5 bottom-[calc(env(safe-area-inset-bottom)+92px)] h-14 px-5 rounded-full bg-accent text-accent-ink font-semibold shadow-lg flex items-center gap-2"
      >
        <span aria-hidden className="text-[22px] leading-none">+</span> Log food
      </button>
      <LogSheet open={open} onClose={() => setOpen(false)} date={date} isToday={isToday} defaultMeal={defaultMeal} />
    </>
  );
}
