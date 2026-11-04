"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Meal } from "@/domain/nutrition";
import { LogSheet, type LogTab } from "./log-sheet";
import { lastTab } from "./last-tab";

interface OpenOptions {
  tab?: LogTab;
  meal?: Meal;
}

const Ctx = createContext<(o?: OpenOptions) => void>(() => {});

/** Opens the one log sheet on the Food page, from the dock or a meal. */
export const useOpenLog = () => useContext(Ctx);

export function LogProvider({
  date,
  isToday,
  defaultMeal,
  children,
}: {
  date: string;
  isToday: boolean;
  defaultMeal: Meal;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<{ open: boolean; tab: LogTab; meal: Meal }>({ open: false, tab: "search", meal: defaultMeal });
  const open = useCallback(
    (o?: OpenOptions) => setState({ open: true, tab: o?.tab ?? lastTab(), meal: o?.meal ?? defaultMeal }),
    [defaultMeal]
  );
  const value = useMemo(() => open, [open]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <LogSheet
        open={state.open}
        onClose={() => setState((s) => ({ ...s, open: false }))}
        date={date}
        isToday={isToday}
        defaultMeal={state.meal}
        initialTab={state.tab}
      />
    </Ctx.Provider>
  );
}
