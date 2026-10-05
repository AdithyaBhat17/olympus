"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. */
  label: string;
  children: React.ReactNode;
  /** "bottom" = grabber sheet; "full" = full-height overlay. */
  variant?: "bottom" | "full";
  className?: string;
}

let openCount = 0;
/** Pops we caused ourselves (closing from the UI) — not a user "back". */
let ignorePops = 0;
let popIsOurs = false;
let popWatcher = false;
/** Registered before any sheet's listener, so it classifies each pop first. */
function watchPops() {
  if (popWatcher) return;
  popWatcher = true;
  window.addEventListener("popstate", () => {
    popIsOurs = ignorePops > 0;
    if (popIsOurs) ignorePops -= 1;
  });
}

/**
 * Modal sheet, portalled to <body>:
 * - radius 32, 40×5 grabber, scrim; the page behind scales to .94
 *   (html[data-sheet] in globals.css), 360 ms cubic-bezier(.32,.72,0,1).
 * - Android back / browser back closes the sheet first: opening pushes a
 *   history entry, popstate closes it.
 * - Escape closes, focus moves in on open and is restored on close, page
 *   scroll is locked.
 */
export function Sheet({ open, onClose, label, children, variant = "bottom", className }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const pushed = useRef<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    openCount += 1;
    document.documentElement.dataset.sheet = "open";

    // One history entry per open sheet so the back gesture closes it. Deferred
    // a tick so an immediate unmount (StrictMode, fast close) never pushes.
    const pushTimer = window.setTimeout(() => {
      const marker = `sheet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        window.history.pushState({ ...(window.history.state ?? {}), __olympusSheet: marker }, "");
        pushed.current = marker;
      } catch {
        pushed.current = null;
      }
    }, 0);
    watchPops();
    const onPop = () => {
      if (popIsOurs || pushed.current == null) return;
      pushed.current = null;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    first?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(pushTimer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      document.body.style.overflow = prevOverflow;
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) delete document.documentElement.dataset.sheet;
      // Closed from the UI: drop our history entry — but only if we're still on
      // it (a link inside the sheet may have navigated away).
      if (pushed.current && window.history.state?.__olympusSheet === pushed.current) {
        ignorePops += 1;
        window.history.back();
      }
      pushed.current = null;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open || !mounted) return null;

  if (variant === "full") {
    return createPortal(
      <div className="fixed inset-0 z-[60] bg-bg animate-fade-in">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          className={cn("h-full overflow-y-auto overscroll-contain max-w-lg mx-auto outline-none", className)}
        >
          {children}
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="no-press absolute inset-0 bg-fg/50 animate-fade-in cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-lg mx-auto max-h-[92dvh] overflow-y-auto overscroll-contain",
          "bg-sheet rounded-t-[40px] shadow-[0_-8px_30px_rgba(30,20,18,.12)]",
          "px-3 pt-2 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+12px))]",
          "flex flex-col gap-3 animate-sheet-up outline-none",
          className
        )}
      >
        <div aria-hidden className="w-10 h-[5px] rounded-[3px] bg-key-down self-center shrink-0" />
        {children}
      </div>
    </div>,
    document.body
  );
}
