"use client";

import { setPref, usePrefs } from "@/lib/prefs";
import { hapticTick } from "@/lib/haptics";
import { Switch } from "@/components/ui/switch";

/** Per-device switches: haptics and Screen Wake Lock during a session. */
export function GymFloorPrefs() {
  const prefs = usePrefs();
  return (
    <>
      <div className="flex items-center gap-3 min-h-14 px-4 py-2 border-b border-line">
        <span className="flex-1 flex flex-col gap-0.5">
          <span id="pref-haptics">Haptic tick on log &amp; rest end</span>
          <span className="text-xs text-muted">Android · iOS 18+ Safari</span>
        </span>
        <Switch
          checked={prefs.haptics}
          labelledBy="pref-haptics"
          onChange={(v) => {
            setPref("haptics", v);
            if (v) hapticTick();
          }}
        />
      </div>
      <div className="flex items-center gap-3 min-h-14 px-4 py-2">
        <span className="flex-1 flex flex-col gap-0.5">
          <span id="pref-wake">Keep screen awake in a session</span>
          <span className="text-xs text-muted">Screen Wake Lock</span>
        </span>
        <Switch checked={prefs.wakeLock} labelledBy="pref-wake" onChange={(v) => setPref("wakeLock", v)} />
      </div>
    </>
  );
}
