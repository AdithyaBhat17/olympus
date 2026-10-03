"use client";

import { cn } from "@/lib/utils";

export const RPE_VALUES = [6, 7, 7.5, 8, 8.5, 9, 10] as const;

interface RpeStripProps {
  setLabel: string;
  value: number | null | undefined;
  /** Same value again clears it. */
  onPick: (rpe: number | null) => void;
}

/** Inline RPE chips for the last logged set — optional, one tap. */
export function RpeStrip({ setLabel, value, onPick }: RpeStripProps) {
  const id = `rpe-label-${setLabel}`;
  return (
    <div className="mt-1 p-2.5 rounded-[18px] bg-surface-sunk flex flex-col gap-2 animate-slide-up">
      <span id={id} className="px-0.5 text-[13px] text-fg-2">
        How hard was set {setLabel}? <span className="text-faint">· optional</span>
      </span>
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-7 gap-[2px]">
        {RPE_VALUES.map((v) => {
          const checked = value === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onPick(checked ? null : v)}
              className={cn(
                "h-11 min-w-0 rounded-xl num text-[18px]",
                checked ? "bg-fg text-bg" : "bg-surface-2 text-fg-2"
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
