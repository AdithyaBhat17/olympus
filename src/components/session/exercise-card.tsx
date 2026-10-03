"use client";

import Link from "next/link";
import { formatKg, isHarder, progressDelta } from "@/domain/load";
import type { LiveItemView } from "@/server/sessions";
import { cn } from "@/lib/utils";
import { WarnIcon, InfoIcon } from "./icons";
import { OptionsMenu, type MenuEntry } from "./options-menu";
import { openKg, plannedMinutes, targetLabel, targetRpe } from "./format";

interface ExerciseCardProps {
  item: LiveItemView;
  position: number;
  total: number;
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
  return <span className="chip-outline ml-1.5 text-info border-info-line align-middle font-sans">straps</span>;
}

function Tile({ label, children, ember }: { label: string; children: React.ReactNode; ember?: boolean }) {
  return (
    <div
      className={cn(
        "px-3 py-2.5 rounded-[14px] flex flex-col gap-0.5 min-w-0",
        ember ? "bg-accent-bg shadow-[inset_0_0_0_1px_rgba(255,106,43,.35)]" : "bg-surface-2"
      )}
    >
      <span className={cn("text-[11px] tracking-[0.06em] uppercase", ember ? "text-accent-soft" : "text-muted")}>
        {label}
      </span>
      <span className="num text-[22px] truncate">{children}</span>
    </div>
  );
}

const btn = "h-11 rounded-[14px] bg-surface-2 text-fg-2 text-sm font-medium disabled:opacity-40";

export function ExerciseCard({
  item,
  position,
  total,
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
  const mode = exercise.loadMode;
  const target = targetLabel(item);
  const rpe = targetRpe(item);
  const planned = openKg(item);
  const open = planned ?? item.lastTopKg;
  const delta =
    planned != null && item.lastTopKg != null && isHarder(mode, planned, item.lastTopKg)
      ? Math.abs(progressDelta(mode, item.lastTopKg, planned))
      : null;

  const entries: MenuEntry[] = [];
  if (onSwap) entries.push({ label: "Swap exercise", onSelect: onSwap });
  if (exercise.formCueId) entries.push({ label: "Form cues", href: `/form/${exercise.formCueId}` });
  entries.push({ label: "Add set", onSelect: onAddSet });
  entries.push({ label: "Remove last set", onSelect: onRemoveSet, disabled: !canRemoveSet, danger: true });

  const cueLines = [...item.coachFlags, ...item.cues];

  return (
    <section
      aria-label="Current exercise"
      className="mx-3 mt-3.5 pt-[18px] px-3.5 pb-3.5 rounded-[28px] bg-surface shadow-[inset_0_0_0_1px_#232327] flex flex-col gap-3.5"
    >
      <div className="flex justify-between items-start gap-2 px-1">
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="font-mono text-xs tracking-[0.08em] text-accent">
            NOW · {position} OF {total}
          </span>
          <h1 key={exercise.id} className="m-0 num text-[36px] leading-[0.95] animate-slide-up">
            {exercise.name}
            {item.straps && <StrapsChip />}
          </h1>
        </div>
        <OptionsMenu entries={entries} />
      </div>

      {item.swapped && item.plannedExercise && (
        <p className="m-0 px-1 -mt-1 flex gap-2 items-center text-[13px] text-muted">
          <InfoIcon size={16} className="text-info shrink-0" />
          Swapped in for {item.plannedExercise.name}
        </p>
      )}
      {item.blockedReason && (
        <div className="mx-1 flex gap-2.5 items-start px-3 py-2.5 rounded-[14px] bg-danger-bg text-[13px] text-danger-text leading-[1.4]">
          <WarnIcon size={18} className="shrink-0 text-danger mt-px" />
          <span>Blocked for you — {item.blockedReason}. Sets log with an override flag for your PT.</span>
        </div>
      )}

      {(cueLines.length > 0 || exercise.formCueId) && (
        <div className="mx-1 flex gap-2.5 items-center min-h-11 py-2 pl-3 pr-2 rounded-[14px] bg-[rgba(140,200,255,.08)] text-info-text text-[13px] leading-[1.4]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8CC8FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 self-start mt-0.5">
            <path d="M12 3l9 16H3z" />
            <path d="M12 10v4M12 17h.01" />
          </svg>
          <ul className="m-0 p-0 list-none flex-1 flex flex-col gap-1">
            {cueLines.length ? (
              cueLines.map((c, i) => (
                <li key={`${i}-${c}`}>
                  {i < item.coachFlags.length && <span className="sr-only">Coach flag: </span>}
                  {i === 0 ? `PT: ${c}` : c}
                </li>
              ))
            ) : (
              <li>Form cues from your PT</li>
            )}
          </ul>
          {exercise.formCueId && (
            <Link
              href={`/form/${exercise.formCueId}`}
              prefetch
              className="shrink-0 self-start flex items-center gap-1 h-11 -my-1.5 px-2.5"
            >
              <span className="flex items-center gap-1 h-[30px] px-2.5 rounded-full bg-[rgba(140,200,255,.14)] text-info text-xs font-semibold">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
                </svg>
                Form
              </span>
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        <Tile label="Target">{target ?? `${item.sets.length} sets`}</Tile>
        <Tile label="RPE">{rpe != null ? formatKg(rpe) : "—"}</Tile>
        {mode === "TIME" ? (
          <Tile label="Total" ember>
            {plannedMinutes(item)?.total ?? "—"}
            <span className="text-sm text-muted"> min</span>
          </Tile>
        ) : (
          <Tile label="Open at" ember>
            {open != null ? formatKg(open) : "—"}
            {mode === "COUNTERWEIGHT" && <span className="text-sm text-muted"> cw</span>}
            {delta != null && delta > 0 && <span className="text-sm text-info"> ↑{formatKg(delta)}</span>}
          </Tile>
        )}
      </div>

      {children}

      {item.done && next && (
        <button type="button" onClick={onNext} className="btn-primary">
          Next: {next.name}
        </button>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        <button type="button" onClick={onAddSet} className={btn}>
          + Set
        </button>
        <button type="button" onClick={onSwap ?? undefined} disabled={!onSwap} className={btn}>
          Swap
        </button>
        <button type="button" onClick={onNote} className={btn}>
          Note
        </button>
      </div>
    </section>
  );
}
