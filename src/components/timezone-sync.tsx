"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { adoptTimezoneAction } from "@/app/(app)/settings/actions";

/**
 * A new athlete has no timezone yet. Adopt this device's once, so "today"
 * starts at their midnight, not the server's. Settings can change it after.
 */
export function TimezoneSync() {
  const router = useRouter();
  useEffect(() => {
    let tz: string;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!tz) return;
    void adoptTimezoneAction(tz).then((r) => {
      if (r.ok && r.data) router.refresh();
    });
  }, [router]);
  return null;
}
