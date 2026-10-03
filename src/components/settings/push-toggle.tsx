"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deletePushSubscriptionAction,
  savePushSubscriptionAction,
} from "@/lib/liftlog-actions";
import { Switch } from "@/components/ui/switch";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from(Array.from(raw).map((c) => c.charCodeAt(0)));
}

type State = "loading" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

/** "Plan's ready" notifications on this device. iOS needs the app on the Home Screen. */
export function PushToggle({ vapidKey }: { vapidKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!vapidKey) return setState("unconfigured");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [vapidKey]);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey!) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await savePushSubscriptionAction(json);
      if (!r.ok) throw new Error(r.error);
      setState("on");
      toast.success("You'll get a ping when your PT pushes a plan");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't enable notifications");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  const note: Record<State, string> = {
    loading: "Checking…",
    unsupported: "This browser can't receive push. On iPhone, add Olympus to the Home Screen first.",
    unconfigured: "Server has no VAPID keys yet (see README).",
    denied: "Notifications are blocked for this site in system settings.",
    off: "Off on this device.",
    on: "On for this device.",
  };

  const usable = state === "off" || state === "on";
  return (
    <div className="flex items-center gap-3 min-h-14 px-4 py-2 border-b border-line">
      <span className="flex-1 flex flex-col gap-0.5">
        <span id="pref-push">Push when your PT sends a plan</span>
        {!usable || state === "off" ? <span className="text-xs text-muted leading-snug">{note[state]}</span> : null}
      </span>
      <Switch
        checked={state === "on"}
        labelledBy="pref-push"
        disabled={!usable || busy}
        onChange={(v) => void (v ? enable() : disable())}
      />
    </div>
  );
}
