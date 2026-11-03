"use client";

import { hapticTick } from "@/lib/haptics";
import { useOpenLog } from "./log-context";

export function SparkIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5c.4 0 .7.3.8.7l.9 3.6a5 5 0 0 0 3.5 3.5l3.6.9a.8.8 0 0 1 0 1.6l-3.6.9a5 5 0 0 0-3.5 3.5l-.9 3.6a.8.8 0 0 1-1.6 0l-.9-3.6a5 5 0 0 0-3.5-3.5l-3.6-.9a.8.8 0 0 1 0-1.6l3.6-.9a5 5 0 0 0 3.5-3.5l.9-3.6c.1-.4.4-.7.8-.7z" />
    </svg>
  );
}

export function SearchIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 20 20" />
    </svg>
  );
}

export function BarcodeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M3.5 8V6a2.5 2.5 0 0 1 2.5-2.5h2M16 3.5h2A2.5 2.5 0 0 1 20.5 6v2M20.5 16v2a2.5 2.5 0 0 1-2.5 2.5h-2M8 20.5H6A2.5 2.5 0 0 1 3.5 18v-2" />
      <path d="M8 8v8M11 8v8M14 8v8M17 8v8" strokeWidth="1.8" />
    </svg>
  );
}

/**
 * The way in, always in reach: a describe field sitting just above the tab
 * bar (MacroFactor / Alma), with search and barcode beside it. Replaces the
 * floating "Log food" button that crowded the nav.
 */
export function ComposerDock() {
  const open = useOpenLog();
  const go = (tab: "describe" | "search" | "barcode") => {
    hapticTick();
    open({ tab });
  };
  return (
    <>
      {/* Content fades out under the dock and tab bar instead of colliding with them. */}
      <div
        aria-hidden="true"
        className="fixed z-30 inset-x-0 bottom-0 pointer-events-none bg-gradient-to-t from-bg from-55% to-bg/0"
        style={{ height: "calc(env(safe-area-inset-bottom, 0px) + 190px)" }}
      />
      <div
        className="fixed z-40 inset-x-0 flex justify-center px-4 pointer-events-none"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)" }}
      >
        <div className="glass pointer-events-auto w-full max-w-[400px] h-[60px] rounded-full p-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => go("describe")}
            className="press-soft flex-1 min-w-0 h-12 rounded-full bg-surface pl-4 pr-3 flex items-center gap-2.5 text-left"
          >
            <span className="text-accent shrink-0">
              <SparkIcon />
            </span>
            <span className="truncate text-[16px] text-muted">Describe what you ate</span>
          </button>
          <button type="button" onClick={() => go("search")} aria-label="Search foods" className="w-12 h-12 rounded-full bg-surface flex items-center justify-center text-fg shrink-0">
            <SearchIcon />
          </button>
          <button type="button" onClick={() => go("barcode")} aria-label="Barcode" className="w-12 h-12 rounded-full bg-surface flex items-center justify-center text-fg shrink-0">
            <BarcodeIcon />
          </button>
        </div>
      </div>
    </>
  );
}
