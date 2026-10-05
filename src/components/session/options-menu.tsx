"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DotsIcon } from "./icons";

export type MenuEntry =
  | { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean }
  | { label: string; href: string };

/** The "…" exercise options menu. Closes on outside tap and Escape. */
export function OptionsMenu({ entries, label = "Exercise options" }: { entries: MenuEntry[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass =
    "w-full min-h-12 px-4 flex items-center text-left text-[15px] active:bg-surface-3 focus:bg-surface-3 focus:outline-none disabled:opacity-40";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-11 h-11 flex items-center justify-center rounded-full bg-white/20 text-current"
      >
        <DotsIcon />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 top-12 z-40 w-56 py-1.5 rounded-[22px] bg-white text-fg shadow-[0_16px_40px_rgba(30,20,18,.18)] animate-scale-in origin-top-right"
        >
          {entries.map((e) =>
            "href" in e ? (
              <Link key={e.label} role="menuitem" href={e.href} className={itemClass} onClick={() => setOpen(false)}>
                {e.label}
              </Link>
            ) : (
              <button
                key={e.label}
                type="button"
                role="menuitem"
                disabled={e.disabled}
                className={`${itemClass}${e.danger ? " text-danger-soft" : ""}`}
                onClick={() => {
                  setOpen(false);
                  e.onSelect();
                }}
              >
                {e.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
