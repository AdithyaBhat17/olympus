"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/liftlog-actions";

/**
 * Runs a server action: toasts the error on failure, re-pulls the server view
 * on success (inside a transition so the UI stays responsive).
 * `busy` is true while any action is in flight; `refreshing` while the
 * follow-up router.refresh() renders.
 */
export function useAction() {
  const router = useRouter();
  const [inFlight, setInFlight] = useState(0);
  const [refreshing, startTransition] = useTransition();

  const run = useCallback(
    async <T,>(
      fn: () => Promise<ActionResult<T>>,
      opts: { refresh?: boolean } = {}
    ): Promise<ActionResult<T>> => {
      setInFlight((n) => n + 1);
      try {
        const res = await fn();
        if (!res.ok) {
          toast.error(res.error);
        } else if (opts.refresh !== false) {
          startTransition(() => router.refresh());
        }
        return res;
      } catch {
        const error = "Couldn't reach the server. Try again.";
        toast.error(error);
        return { ok: false, error };
      } finally {
        setInFlight((n) => n - 1);
      }
    },
    [router]
  );

  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  return { run, refresh, busy: inFlight > 0, refreshing, pending: inFlight > 0 || refreshing };
}
