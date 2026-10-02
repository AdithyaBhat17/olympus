"use client";

import { formatKg } from "@/domain/load";
import type { LiveItemView } from "@/server/sessions";
import { cn } from "@/lib/utils";
import { WarnIcon, InfoIcon } from "./icons";
import { OptionsMenu, type MenuEntry } from "./options-menu";
import { loadWithUnit, openKg, targetLabel, targetRpe } from "./format";

interface ExerciseCardProps {
  item: LiveItemView;
  position: number;
  total: number;
  disabled: boolean;
  canRemoveSet: boolean;
  next: { name: string } | null;
  onSwap: (() => void) | null;
  onAddSet: () => void;
  onRemoveSet: () => void;
  onNote: () => void;
  onNext: () => void;
  children: React.ReactNode;
}

export function StrapsChip() {
  return <span className="chip ml-1 text-info border-info-line whitespace-nowrap">straps</span>;
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={cn(
        "p-2.5 rounded-[10px] flex flex-col gap-0.5 min-w-0",
        accent ? "bg-accent-bg border border-accent-line" : "bg-surface-2"
      )}
    >
      <span
        className={cn(
          "text-[11px] uppercase tracking-[0.05em]",
          accent ? "text-accent-soft" : "text-muted"
        )}
      >
        {label}
      </span>
      <span className="font-display text-xl font-semibold tabular-nums truncate">{value}</span>
    </div>
  );
}

export function ExerciseCard({
  item,
  position,
  total,
  disabled,
  canRemoveSet,
  next,
  onSwap,
  onAddSet,
  onRemoveSet,
  onNote,
  onNext,
  children,
}: ExerciseCardProps) {
  const { exercise } = item;
  const target = targetLabel(item);
  const rpe = targetRpe(item);
  const open = openKg(item) ?? item.lastTopKg;

  const entries: MenuEntry[] = [];
  if (onSwap) entries.push({ label: "Swap exercise", onSelect: onSwap, disabled });
  if (exercise.formCueId) entries.push({ label: "Form cues", href: `/form/${exercise.formCueId}` });
  entries.push({ label: "Add set", onSelect: onAddSet, disabled });
  entries.push({ label: "Remove last set", onSelect: onRemoveSet, disabled: disabled || !canRemoveSet, danger: true });

  return (
    <section
      aria-label="Current exercise"
      className="mx-4 mt-4 px-4 py-[18px] rounded-[18px] bg-surface border border-accent-ring flex flex-col gap-3.5"
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-xs font-semibold tracking-[0.06em] uppercase text-accent">
            Now · {position} of {total}
          </span>
          <h1 className="m-0 font-display font-bold text-[32px] leading-none">
            {exercise.name}
            {item.straps && (
              <span className="align-middle font-sans">
                {" "}
                <StrapsChip />
              </span>
            )}
          </h1>
        </div>
        <OptionsMenu entries={entries} />
      </div>

      {item.swapped && item.plannedExercise && (
        <p className="flex gap-2 items-center text-[13px] text-muted -mt-1">
          <InfoIcon size={16} className="text-info shrink-0" />
          Swapped in for {item.plannedExercise.name}
        </p>
      )}
      {item.blockedReason && (
        <div className="flex gap-2.5 items-start px-3 py-2.5 rounded-[10px] bg-danger-bg border border-danger-line text-[13px] text-danger-text leading-[1.4]">
          <WarnIcon size={18} className="shrink-0 text-danger-soft mt-px" />
          <span>
            Blocked for you — {item.blockedReason}. Sets log with an override flag for your PT.
          </span>
        </div>
      )}

      {(item.cues.length > 0 || item.coachFlags.length > 0) && (
        <ul className="m-0 p-0 list-none flex flex-col gap-1.5 text-sm leading-[1.4]">
          {item.coachFlags.map((f) => (
            <li key={`f-${f}`} className="flex gap-2 text-fg">
              <span aria-hidden className="text-accent font-display font-bold">!</span>
              <span>
                <span className="sr-only">Coach flag: </span>
                {f}
              </span>
            </li>
          ))}
          {item.cues.map((c) => (
            <li key={`c-${c}`} className="flex gap-2 text-fg-2">
              <span aria-hidden className="text-faint">·</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Tile label="Target" value={target ?? `${item.sets.length} sets`} />
        <Tile label="RPE" value={rpe != null ? formatKg(rpe) : "—"} />
        <Tile
          label="Open at"
          value={open != null ? loadWithUnit(exercise.loadMode, open) : "Calibrate"}
          accent
        />
      </div>

      {children}

      {item.done && next && (
        <button type="button" onClick={onNext} className="btn-primary">
          Next: {next.name}
        </button>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onAddSet} disabled={disabled} className="btn-ghost grow basis-0 disabled:opacity-50">
          + Add set
        </button>
        {onSwap && (
          <button type="button" onClick={onSwap} disabled={disabled} className="btn-ghost grow basis-0 disabled:opacity-50">
            Swap exercise
          </button>
        )}
        <button type="button" onClick={onNote} className="btn-ghost grow basis-0">
          Note
        </button>
      </div>
    </section>
  );
}
