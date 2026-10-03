"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cancelRestPushAction, scheduleRestPushAction } from "@/lib/liftlog-actions";
import { hapticRestEnd } from "@/lib/haptics";
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
  if (!startedAt || now == null) return <span>0:00</span>;
  return (
    <span suppressHydrationWarning>
      {clock((now - new Date(startedAt).getTime()) / 1000).replace(/^0(\d)/, "$1")}
    </span>
  );
}

export interface RestState {
  /** epoch ms */
  endAt: number;
  totalSec: number;
  label: string;
}

interface RestPillProps {
  sessionId: string;
  rest: RestState | null;
  /** "set 3" — what's next once rest ends. */
  nextLabel: string | null;
  onAdd: (sec: number) => void;
  onSkip: () => void;
}

const R = 22;
const C = 2 * Math.PI * R; // 138.2
const GET_SET_SEC = 10;

/**
 * Floating rest pill in the thumb zone. Remaining time is derived from `endAt`
 * on every tick (no server, survives reloads via localStorage). The ring
 * drains linearly; the last 10 s turn ice with "Get set". At 0: haptic, and a
 * push if the app is in the background.
 */
export function RestPill({ sessionId, rest, nextLabel, onAdd, onSkip }: RestPillProps) {
  const now = useNow(250, !!rest);
  const [mounted, setMounted] = useState(false);
  const firedFor = useRef<number | null>(null);
  useEffect(() => setMounted(true), []);

  const remaining = rest && now != null ? Math.max(0, (rest.endAt - now) / 1000) : null;
  const finished = remaining != null && remaining <= 0;
  const getSet = remaining != null && remaining > 0 && remaining <= GET_SET_SEC;

  // Rest end: tick once per timer, and let the pill go idle shortly after.
  useEffect(() => {
    if (!rest || !finished) return;
    if (firedFor.current !== rest.endAt) {
      firedFor.current = rest.endAt;
      // Don't buzz for a timer that ran out before this page loaded.
      if (Date.now() - rest.endAt < 5000) hapticRestEnd();
    }
    const t = window.setTimeout(onSkip, 2500);
    return () => window.clearTimeout(t);
  }, [finished, rest, onSkip]);

  // Backgrounded mid-rest: ask the server to push at endAt; cancel on return.
  useEffect(() => {
    if (!rest) return;
    let scheduled = false;
    const body = nextLabel ? `Next up: ${nextLabel}` : "Time for the next set";
    const onVis = () => {
      if (document.visibilityState === "hidden" && rest.endAt > Date.now() + 3000) {
        scheduled = true;
        void scheduleRestPushAction({ sessionId, endAt: rest.endAt, body }).catch(() => {});
      } else if (document.visibilityState === "visible" && scheduled) {
        scheduled = false;
        void cancelRestPushAction().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (scheduled) void cancelRestPushAction().catch(() => {});
    };
  }, [rest, sessionId, nextLabel]);

  if (!mounted) return null;

  const active = rest != null && remaining != null;
  const frac = active ? Math.min(1, remaining / rest.totalSec) : 0;
  const pos = "fixed z-40 left-3 right-3 mx-auto max-w-[480px] glass";
  const bottom = { bottom: "calc(env(safe-area-inset-bottom, 0px) + 26px)" };

  return createPortal(
    active ? (
      <div
        key={rest.endAt - rest.totalSec * 1000}
        role="timer"
        aria-label={`Rest timer, ${shortClock(remaining)} left`}
        className={cn(pos, "h-[76px] rounded-[38px] flex items-center gap-3 pl-3 pr-2.5 animate-pill")}
        style={{ ...bottom, background: "rgba(20,20,22,.82)" }}
      >
        <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true" className="shrink-0">
          <circle cx="26" cy="26" r={R} fill="none" stroke="#26262A" strokeWidth="5" />
          <circle
            cx="26"
            cy="26"
            r={R}
            fill="none"
            stroke={getSet || finished ? "#8CC8FF" : "#FF6A2B"}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - frac)}
            transform="rotate(-90 26 26)"
            style={{ transition: "stroke-dashoffset 250ms linear, stroke 300ms" }}
          />
        </svg>
        <div className="flex-1 flex flex-col gap-px min-w-0" aria-live="polite">
          <span className={cn("text-xs truncate", getSet || finished ? "text-info" : "text-muted")}>
            {finished
              ? "Rest done — go"
              : getSet
                ? `Get set — next up: ${nextLabel ?? "next set"}`
                : rest.label}
          </span>
          <span className="num text-[30px]">{shortClock(remaining)}</span>
        </div>
        <button
          type="button"
          onClick={() => onAdd(30)}
          aria-label="Add 30 seconds"
          className="h-[52px] min-w-14 rounded-[26px] bg-surface-3 text-fg font-semibold text-[15px]"
        >
          +30
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="h-[52px] min-w-16 rounded-[26px] bg-fg text-bg font-semibold text-[15px]"
        >
          Skip
        </button>
      </div>
    ) : (
      <div
        role="timer"
        aria-label="Rest timer idle"
        className={cn(pos, "h-14 rounded-[28px] flex items-center justify-center gap-2 text-muted text-[13px]")}
        style={{ ...bottom, background: "rgba(20,20,22,.7)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2 2M9 2h6" />
        </svg>
        Rest starts the moment you tick a set
      </div>
    ),
    document.body
  );
}

const restKey = (sessionId: string) => `olympus.rest.${sessionId}`;

export function loadRest(sessionId: string): RestState | null {
  try {
    const raw = window.localStorage.getItem(restKey(sessionId));
    if (!raw) return null;
    const v = JSON.parse(raw) as RestState;
    if (typeof v?.endAt !== "number" || typeof v?.totalSec !== "number") return null;
    // Already over → idle.
    if (Date.now() - v.endAt > 2000) return null;
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
