"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { clock, shortClock } from "./format";

/** Re-renders every `ms` after mount; null on the server and first paint. */
export function useNow(ms = 1000, enabled = true): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms, enabled]);
  return now;
}

/** "24:10" since `startedAt`; rendered only after mount. */
export function Elapsed({ startedAt }: { startedAt: string | null }) {
  const now = useNow(1000, !!startedAt);
  if (!startedAt || now == null) return <span>--:--</span>;
  return (
    <span suppressHydrationWarning>{clock((now - new Date(startedAt).getTime()) / 1000)}</span>
  );
}

export interface RestState {
  /** epoch ms */
  endAt: number;
  totalSec: number;
  label: string;
}

interface RestTimerProps {
  rest: RestState | null;
  onAdd: (sec: number) => void;
  onSkip: () => void;
}

export function RestTimer({ rest, onAdd, onSkip }: RestTimerProps) {
  const now = useNow(250, !!rest);
  const vibratedFor = useRef<number | null>(null);

  const remaining = rest && now != null ? Math.max(0, (rest.endAt - now) / 1000) : null;
  const finished = remaining != null && remaining <= 0;

  useEffect(() => {
    if (!rest || !finished || vibratedFor.current === rest.endAt) return;
    vibratedFor.current = rest.endAt;
    // Don't buzz for a timer that already ran out before this page loaded.
    if (now != null && now - rest.endAt > 5000) return;
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      /* not supported */
    }
  }, [finished, rest, now]);

  const active = rest != null && remaining != null;
  const pct = active ? Math.min(100, Math.max(0, (1 - remaining / rest.totalSec) * 100)) : 0;

  return (
    <div
      role="timer"
      aria-label="Rest timer"
      aria-live="off"
      className="mx-4 mt-3 px-3.5 py-3 rounded-[14px] bg-surface flex items-center gap-3"
    >
      <div className="flex flex-col grow gap-2 min-w-0">
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-[13px] text-muted truncate">
            {active ? (finished ? "Rest done — go" : rest.label) : "Rest · starts when you log a set"}
          </span>
          <span
            className={cn(
              "font-display text-[26px] font-bold leading-none tabular-nums whitespace-nowrap",
              finished && "text-accent"
            )}
          >
            {active ? shortClock(remaining) : "—"}
            {active && (
              <span className="text-base text-muted font-medium"> / {shortClock(rest.totalSec)}</span>
            )}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-line overflow-hidden">
          <div
            className="h-1.5 bg-accent transition-[width] duration-200 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => onAdd(30)}
        aria-label="Add 30 seconds"
        className="w-[52px] h-11 shrink-0 rounded-[10px] border border-line bg-surface-2 font-semibold text-sm"
      >
        +30
      </button>
      <button
        type="button"
        onClick={onSkip}
        disabled={!rest}
        className="w-[52px] h-11 shrink-0 rounded-[10px] border border-line bg-surface-2 font-semibold text-sm disabled:opacity-40"
      >
        Skip
      </button>
    </div>
  );
}

const restKey = (sessionId: string) => `olympus.rest.${sessionId}`;

export function loadRest(sessionId: string): RestState | null {
  try {
    const raw = window.localStorage.getItem(restKey(sessionId));
    if (!raw) return null;
    const v = JSON.parse(raw) as RestState;
    if (typeof v?.endAt !== "number" || typeof v?.totalSec !== "number") return null;
    // Stale (ended more than 10 min ago) → drop.
    if (Date.now() - v.endAt > 10 * 60 * 1000) return null;
    return v;
  } catch {
    return null;
  }
}

export function saveRest(sessionId: string, rest: RestState | null) {
  try {
    if (rest) window.localStorage.setItem(restKey(sessionId), JSON.stringify(rest));
    else window.localStorage.removeItem(restKey(sessionId));
  } catch {
    /* storage unavailable — timer still works in memory */
  }
}
