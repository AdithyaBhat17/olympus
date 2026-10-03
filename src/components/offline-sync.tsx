"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { flush, onSynced, pendingCount, subscribePending } from "@/lib/offline/outbox";

/**
 * Drains the offline outbox: on reconnect, when the app returns to the
 * foreground, and every 15 s while anything is queued. After a sync the server
 * view is re-pulled in the background so optimistic overlays settle.
 */
export function OfflineSync() {
  const router = useRouter();
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    const kick = () => void flush();
    const onVis = () => {
      if (document.visibilityState === "visible") kick();
    };
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVis);
    const interval = window.setInterval(() => {
      if (pendingCount() > 0) kick();
    }, 15_000);
    const unsubPending = subscribePending((n) => {
      if (n > 0) kick();
    });
    const unsubSynced = onSynced(() => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => router.refresh(), 600);
    });
    return () => {
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(interval);
      unsubPending();
      unsubSynced();
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, [router]);

  return null;
}
