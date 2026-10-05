"use client";

import { useState } from "react";
import { Sheet } from "./sheet";
import { CheckIcon, CloseIcon } from "./icons";

export const MAX_REPS = 15;

interface RepsSheetProps {
  open: boolean;
  onClose: () => void;
  setLabel: string;
  exerciseName: string;
  initial: number | null;
  onSubmit: (reps: number) => void;
}

/** Reps entry: −/+ stepper plus 1–15 chips. Opened by long-pressing the reps cell. */
export function RepsSheet(props: RepsSheetProps) {
  const { open, onClose, setLabel } = props;
  return (
    <Sheet open={open} onClose={onClose} label={`Set ${setLabel} reps`}>
      {open && <RepsSheetBody {...props} key={setLabel} />}
    </Sheet>
  );
}

function RepsSheetBody({ onClose, setLabel, exerciseName, initial, onSubmit }: RepsSheetProps) {
  const [reps, setReps] = useState(initial ?? 10);
  const clamp = (n: number) => Math.min(MAX_REPS, Math.max(1, n));

  return (
    <>
      <div className="flex justify-between items-center px-1.5">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h2 className="m-0 text-[17px] font-cta">Set {setLabel}, reps</h2>
          <span className="text-[13px] text-muted truncate">{exerciseName}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-1 rounded-full flex items-center justify-center shrink-0">
          <span className="w-9 h-9 rounded-full bg-key text-fg-2 flex items-center justify-center">
            <CloseIcon size={16} strokeWidth={2.6} />
          </span>
        </button>
      </div>

      <div className="grid grid-cols-[64px_1fr_64px] items-center gap-2 py-2">
        <button
          type="button"
          onClick={() => setReps((r) => clamp(r - 1))}
          aria-label="Minus 1 rep"
          className="h-16 rounded-[20px] bg-surface-3 num text-[20px]"
        >
          −1
        </button>
        <span className="num text-[76px] leading-[0.9] text-center" aria-live="polite">
          {reps}
        </span>
        <button
          type="button"
          onClick={() => setReps((r) => clamp(r + 1))}
          aria-label="Plus 1 rep"
          className="h-16 rounded-[20px] bg-surface-3 num text-[20px]"
        >
          +1
        </button>
      </div>

      <div role="group" aria-label="Quick reps" className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: MAX_REPS }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setReps(n)}
            aria-pressed={reps === n}
            className={`h-12 rounded-[14px] num text-[20px] ${reps === n ? "bg-k text-k-on" : "bg-key active:bg-key-down"}`}
          >
            {n}
          </button>
        ))}
      </div>

      <button type="button" className="btn-primary" onClick={() => onSubmit(reps)}>
        <CheckIcon size={20} strokeWidth={2.8} />
        Set {reps} reps
      </button>
    </>
  );
}
