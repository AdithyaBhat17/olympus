"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Value in monospace with a Copy button that morphs to an ice "✓ Copied" for 1.6 s. */
export function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted px-1">{label}</span>
      <div className="flex items-center gap-2 min-h-12 rounded-[14px] bg-surface-sunk pl-3.5 pr-1.5 py-1.5">
        <code
          className={cn(
            "flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-fg-2 select-all",
            mono && "font-mono"
          )}
          title={value}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              if (timer.current) window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => setCopied(false), 1600);
            } catch {
              /* clipboard blocked — the value is selectable */
            }
          }}
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          className={cn(
            "h-11 px-3 rounded-[10px] text-[13px] font-semibold flex items-center gap-1.5 shrink-0 transition-colors duration-200",
            copied ? "bg-info-bg text-info" : "bg-surface-3 text-fg"
          )}
        >
          {copied && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="animate-pop">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
