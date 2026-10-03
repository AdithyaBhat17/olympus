"use client";

import { useEffect } from "react";
import { usePrefs } from "./prefs";

/**
 * Keep the screen on while `active` (a live session). Re-acquired when the tab
 * becomes visible again — the browser drops the lock on hide. Released on
 * unmount (Finish navigates away).
 */
export function useWakeLock(active: boolean) {
  const { wakeLock: enabled } = usePrefs();

  useEffect(() => {
    if (!active || !enabled || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible" || sentinel) return;
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void s.release();
          return;
        }
        sentinel = s;
        s.addEventListener("release", () => {
          if (sentinel === s) sentinel = null;
        });
      } catch {
        /* denied (low battery, not visible…) */
      }
    };
    const onVis = () => void acquire();

    void acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active, enabled]);
}
