import type { LogTab } from "./log-sheet";

const KEY = "olympus.food.tab";

/** The tab the athlete used last: the sheet opens where they left off. Search until they choose. */
export function lastTab(): LogTab {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "describe" || t === "search" || t === "barcode") return t;
  } catch {
    // storage blocked: fine
  }
  return "search";
}

export function rememberTab(tab: LogTab): void {
  try {
    localStorage.setItem(KEY, tab);
  } catch {
    // storage blocked: fine
  }
}
