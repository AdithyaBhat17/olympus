"use client";

import { Sheet } from "@/components/session/sheet";
import { CloseIcon } from "@/components/session/icons";
import type { Workout } from "./next-session-card";

interface WorkoutSheetProps {
  open: boolean;
  onClose: () => void;
  type: string;
  workout: Workout;
}

/** The whole planned session, read-only, so it can be checked before Let's go. */
export function WorkoutSheet({ open, onClose, type, workout }: WorkoutSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} label={`Session ${type} workout`}>
      <div className="flex justify-between items-center px-1.5">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h2 className="m-0 text-[17px] font-cta">Session {type}</h2>
          <span className="text-[13px] text-muted truncate">
            {workout.title}, {workout.items.length} exercise{workout.items.length === 1 ? "" : "s"}
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-1 rounded-full flex items-center justify-center shrink-0">
          <span className="w-9 h-9 rounded-full bg-key text-fg-2 flex items-center justify-center">
            <CloseIcon size={16} strokeWidth={2.6} />
          </span>
        </button>
      </div>

      {workout.coachNotes && (
        <p className="m-0 px-4 py-3 rounded-3xl bg-surface text-[15px] leading-5 text-fg-2 whitespace-pre-line">
          {workout.coachNotes}
        </p>
      )}

      <ol className="m-0 p-0 list-none flex flex-col gap-2">
        {workout.items.map((it, i) => (
          <li key={it.key} className="px-4 py-3 rounded-3xl bg-surface flex flex-col gap-1">
            <div className="flex items-baseline gap-3">
              <span className="num w-[18px] text-[15px] text-muted shrink-0">{i + 1}</span>
              <span className="flex-1 min-w-0 font-semibold">
                {it.name}
                {it.straps && <span className="chip-outline ml-1.5">straps</span>}
                {it.pair && <span className="chip-outline ml-1.5">superset {it.pair}</span>}
              </span>
              {it.load && <span className="num text-[17px] shrink-0">{it.load}</span>}
            </div>
            <p className="m-0 pl-[30px] text-[15px] text-fg-2">
              {[it.sets, it.rest].filter(Boolean).join(", ")}
            </p>
            {it.cues.length > 0 && (
              <ul className="m-0 pl-[46px] list-disc text-[13px] leading-[18px] text-muted flex flex-col gap-0.5">
                {it.cues.map((c, j) => (
                  <li key={j}>{c}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
