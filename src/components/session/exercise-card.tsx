"use client";

import Link from "next/link";
import { formatKg, isHarder, progressDelta } from "@/domain/load";
import type { LiveItemView } from "@/server/sessions";
import { WarnIcon, InfoIcon } from "./icons";
import { OptionsMenu, type MenuEntry } from "./options-menu";
import { openKg, plannedMinutes, targetLabel, targetRpe } from "./format";
import { Plates, platesFor } from "./plates";

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
  return <span className="chip-outline ml-1.5 border-current align-middle font-sans text-[13px] opacity-90">straps</span>;
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="h-14 px-4 rounded-3xl bg-white/15 flex flex-col justify-center min-w-0">
      <span className="text-[13px] font-semibold opacity-85">{label}</span>
      <span className="num text-[20px] truncate">{children}</span>
    </div>
  );
}

const btn = "h-12 rounded-full bg-surface text-fg text-[15px] font-bold disabled:opacity-40";

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

  const plates = mode === "TOTAL" || mode === "PER_SIDE" ? platesFor(exercise, open) : null;

  return (
    <section aria-label="Current exercise" className="flex flex-col">
      <div className="bg-k text-k-on px-5 pt-4 pb-14 flex flex-col gap-3.5">
        <div className="flex justify-between items-start gap-2">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="num text-[15px] opacity-80">
              {position} of {total}
            </span>
            <h1 key={exercise.id} className="m-0 text-[30px] font-extrabold leading-[34px] animate-slide-up">
              {exercise.name}
              {item.straps && <StrapsChip />}
            </h1>
          </div>
          <OptionsMenu entries={entries} />
        </div>

        <div key={`${exercise.id}-load`} className="flex items-end gap-3 animate-slide-up">
          <span className="flex items-baseline gap-1.5">
            <span className="num text-[88px] leading-[0.9] tracking-[-2px]">
              {mode === "TIME" ? plannedMinutes(item)?.total ?? "—" : open != null ? formatKg(open) : "—"}
            </span>
            <span className="text-[24px] font-bold opacity-85">
              {mode === "TIME" ? "min" : mode === "COUNTERWEIGHT" ? "kg cw" : mode === "PER_SIDE" ? "kg a side" : "kg"}
            </span>
          </span>
          {delta != null && delta > 0 && (
            <span className="mb-2 h-7 px-2.5 rounded-full bg-apricot text-apricot-ink text-[15px] font-extrabold inline-flex items-center animate-pop-in [animation-delay:300ms]">
              +{formatKg(delta)}
            </span>
          )}
        </div>

        {plates && <Plates plates={plates.plates} leftover={plates.leftover} />}

        <div className="grid grid-cols-2 gap-2">
          <Tile label="Target">{target ?? `${item.sets.length} sets`}</Tile>
          <Tile label="Effort">{rpe != null ? `RPE ${formatKg(rpe)}` : "Your call"}</Tile>
        </div>

        {item.swapped && item.plannedExercise && (
          <p className="m-0 flex gap-2 items-center text-[15px] opacity-90">
            <InfoIcon size={16} className="shrink-0" />
            Swapped in for {item.plannedExercise.name}
          </p>
        )}
        {item.blockedReason && (
          <div className="flex gap-2.5 items-start px-4 py-3 rounded-3xl bg-white text-danger-text text-[15px] leading-5">
            <WarnIcon size={18} className="shrink-0 text-danger mt-px" />
            <span>Blocked for you: {item.blockedReason}. Sets log with an override flag for your PT.</span>
          </div>
        )}

        {(cueLines.length > 0 || exercise.formCueId) && (
          <div className="flex gap-2.5 items-center min-h-11 py-2.5 pl-4 pr-2 rounded-3xl bg-white/15 text-[15px] leading-5">
            <ul className="m-0 p-0 list-none flex-1 flex flex-col gap-1">
              {cueLines.length ? (
                cueLines.map((c, i) => (
                  <li key={`${i}-${c}`}>
                    {i < item.coachFlags.length && <span className="sr-only">Coach flag: </span>}
                    {i === 0 ? <><b className="font-extrabold">PT:</b> {c}</> : c}
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
                className="shrink-0 self-start flex items-center gap-1 h-11 -my-1.5 px-1"
              >
                <span className="flex items-center gap-1 h-9 px-3.5 rounded-full bg-white text-k-text text-[13px] font-extrabold">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
                  </svg>
                  Form
                </span>
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="-mt-9 relative rounded-t-[40px] bg-bg px-4 pt-6 flex flex-col gap-4">
        {children}

        {item.done && next && (
          <button type="button" onClick={onNext} className="h-[60px] rounded-full bg-k text-k-on font-extrabold text-[19px]">
            Next: {next.name}
          </button>
        )}

        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={onAddSet} className={btn}>
            Add set
          </button>
          <button type="button" onClick={onSwap ?? undefined} disabled={!onSwap} className={btn}>
            Swap
          </button>
          <button type="button" onClick={onNote} className={btn}>
            Note
          </button>
        </div>
      </div>
    </section>
  );
}
