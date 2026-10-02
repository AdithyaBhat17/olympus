"use client";

import { cn } from "@/lib/utils";

export const RPE_VALUES = [6, 7, 7.5, 8, 8.5, 9, 10] as const;

interface RpePadProps {
  setLabel: string;
  value: number | null | undefined;
  onPick: (rpe: number) => void;
  disabled?: boolean;
}

export function RpePad({ setLabel, value, onPick, disabled }: RpePadProps) {
  return (
    <div className="flex flex-col gap-2 pt-2 px-0.5">
      <span className="text-xs text-muted" id={`rpe-label-${setLabel}`}>
        RPE for set {setLabel} — tap after the set
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`rpe-label-${setLabel}`}
        className="grid grid-cols-7 gap-1.5"
      >
        {RPE_VALUES.map((v) => {
          const checked = value === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={disabled}
              onClick={() => onPick(v)}
              className={cn(
                "h-11 rounded-[10px] font-display text-lg tabular-nums disabled:opacity-60",
                checked
                  ? "border-2 border-accent bg-accent-bg font-bold"
                  : "border border-line bg-surface-2 font-semibold"
              )}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}
