"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createHealthTokenAction,
  disconnectClaudeAction,
  disconnectWhoopAction,
  revokeHealthTokenAction,
  syncWhoopAction,
} from "@/app/(app)/settings/actions";
import { CopyField } from "./copy-field";

function useAction() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = <T,>(
    fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    done?: (data: T) => void
  ) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      done?.(r.data);
      router.refresh();
    });
  return { pending, go };
}

export function DisconnectClaudeButton() {
  const { pending, go } = useAction();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Disconnect every Claude client? You'll need to reconnect the connector.")) return;
        go(disconnectClaudeAction, () => toast.success("Claude disconnected"));
      }}
      className="h-11 px-3 rounded-[10px] bg-surface-3 text-[13px] font-medium flex items-center justify-center shrink-0 disabled:opacity-50 text-danger-soft"
    >
      Disconnect
    </button>
  );
}

export function WhoopButtons({ connected }: { connected: boolean }) {
  const { pending, go } = useAction();
  if (!connected) {
    return (
      <a href="/api/integrations/whoop/connect" className="h-11 px-3 rounded-[10px] bg-surface-3 text-[13px] font-medium flex items-center justify-center shrink-0 disabled:opacity-50 text-fg-2">
        Connect Whoop
      </a>
    );
  }
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => go(syncWhoopAction, (n) => toast.success(`Synced ${n} night${n === 1 ? "" : "s"}`))}
        className="h-11 px-3 rounded-[10px] bg-surface-3 text-[13px] font-medium flex items-center justify-center shrink-0 disabled:opacity-50 text-fg-2"
      >
        {pending ? "Syncing…" : "Sync now"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Disconnect Whoop? Synced sleep stays in your check-ins.")) return;
          go(disconnectWhoopAction, () => toast.success("Whoop disconnected"));
        }}
        className="h-11 px-3 rounded-[10px] bg-surface-3 text-[13px] font-medium flex items-center justify-center shrink-0 disabled:opacity-50 text-danger-soft"
      >
        Disconnect
      </button>
    </div>
  );
}

export function HealthTokenControls({ hasToken, endpoint }: { hasToken: boolean; endpoint: string }) {
  const { pending, go } = useAction();
  const [token, setToken] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <CopyField label="Endpoint (POST)" value={endpoint} />
      {token && (
        <div className="flex flex-col gap-2 p-3 rounded-[16px] bg-accent-bg shadow-[inset_0_0_0_1px_rgba(255,106,43,.35)]">
          <CopyField label="Token — shown once. Paste it into the Shortcut's Authorization header as: Bearer <token>" value={token} />
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (hasToken && !confirm("Make a new token? The old one stops working.")) return;
            go(createHealthTokenAction, (t) => setToken(t));
          }}
          className="h-11 px-3 rounded-[10px] bg-surface-3 text-[13px] font-medium flex items-center justify-center shrink-0 disabled:opacity-50 text-fg-2"
        >
          {hasToken ? "New token" : "Create token"}
        </button>
        {hasToken && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm("Revoke the token? The Shortcut will stop syncing.")) return;
              go(revokeHealthTokenAction, () => {
                setToken(null);
                toast.success("Token revoked");
              });
            }}
            className="h-11 px-3 rounded-[10px] bg-surface-3 text-[13px] font-medium flex items-center justify-center shrink-0 disabled:opacity-50 text-danger-soft"
          >
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}
