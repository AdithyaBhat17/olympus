"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. */
  label: string;
  children: React.ReactNode;
  /** "bottom" = drag-handle sheet; "full" = full-height overlay. */
  variant?: "bottom" | "full";
  className?: string;
}

/**
 * Minimal modal sheet: backdrop, Escape to close, focus moved inside on open
 * and restored on close, body scroll locked while open.
 */
export function Sheet({ open, onClose, label, children, variant = "bottom", className }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

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
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  if (variant === "full") {
    return (
      <div className="fixed inset-0 z-[60] bg-bg animate-fade-in">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          className={cn("h-full overflow-y-auto max-w-lg mx-auto outline-none", className)}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-bg-deep/70 animate-fade-in cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-lg mx-auto max-h-[92vh] overflow-y-auto",
          "bg-surface rounded-t-4xl px-4 pt-2.5 pb-[max(1.75rem,env(safe-area-inset-bottom))]",
          "flex flex-col gap-4 animate-sheet-up outline-none",
          className
        )}
      >
        <div aria-hidden className="w-10 h-[5px] rounded-full bg-line-strong self-center shrink-0" />
        {children}
      </div>
    </div>
  );
}
