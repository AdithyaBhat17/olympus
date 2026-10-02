"use client";

import { useState } from "react";

export function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex items-stretch gap-2">
        <code
          className={`flex-1 min-w-0 px-3 py-2.5 rounded-[10px] bg-bg border border-line text-[13px] text-fg-2 break-all ${mono ? "font-mono" : ""}`}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked — the value is selectable */
            }
          }}
          className="btn-ghost px-3 min-w-[64px]"
          aria-label={`Copy ${label}`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
