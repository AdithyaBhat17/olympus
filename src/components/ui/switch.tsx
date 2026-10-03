"use client";

import { cn } from "@/lib/utils";

/**
 * iOS-style 51×31 switch. The knob stretches while pressed and travels with
 * an overshoot spring. Real <button role="switch">; label via aria-labelledby.
 */
export function Switch({
  checked,
  onChange,
  labelledBy,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  labelledBy: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "no-press group relative w-[51px] h-[31px] shrink-0 rounded-full p-0 transition-colors duration-[250ms] disabled:opacity-40",
        checked ? "bg-accent" : "bg-key-down"
      )}
    >
      {/* 44px hit area without changing the visual size. */}
      <span aria-hidden className="absolute -inset-[7px]" />
      <span
        aria-hidden
        className={cn(
          "absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,.3)]",
          "transition-[transform,width] duration-300 ease-spring group-active:w-[33px]",
          checked ? "translate-x-5 group-active:translate-x-[14px]" : "translate-x-0"
        )}
      />
    </button>
  );
}
