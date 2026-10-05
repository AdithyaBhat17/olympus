"use client";

import { useState } from "react";
import { formatKg, platesFor, roundKg, trueKg } from "@/domain/load";
import type { ExerciseMeta } from "@/server/sessions";
import { cn } from "@/lib/utils";
import { Sheet } from "./sheet";
import { BackspaceIcon, CheckIcon, CloseIcon } from "./icons";

type Mode = "plates" | "side";

export interface LoadSheetValue {
  /** True kg (per side for PER_SIDE), or minutes for TIME. */
  trueKg: number;
  /** Set when the user entered plates; logged as platesKg so the server does the maths. */
  platesKg: number | null;
}

interface LoadSheetProps {
  open: boolean;
  onClose: () => void;
  exercise: ExerciseMeta;
  setLabel: string;
  initialKg: number | null;
  initialPlatesKg: number | null;
  /** Last session's matching set, "50 × 9". */
  last: { weight: number; reps: number } | null;
  /** Reps for the CTA ("Log 52.5 × 10"); null → no reps known. */
  reps: number | null;
  recent: number[];
  /** Heaviest load the PT planned for this exercise. */
  ptMax: number | null;
  /** "log" logs the set; "save" re-logs a done set; "use" only fills the cell. */
  cta: "log" | "save" | "use";
  onSubmit: (v: LoadSheetValue) => void;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"] as const;

function parse(v: string): number | null {
  if (v === "" || v === ".") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Load entry: big Archivo value with a blinking ember caret, ±steppers,
 * recent loads (PT max in ice), and a custom 3×4 keypad — no system keyboard.
 * PER_SIDE machines toggle between plates loaded and true kg per side
 * (plates + carriage). TIME exercises edit minutes.
 */
export function LoadSheet(props: LoadSheetProps) {
  const { open, onClose, exercise, setLabel } = props;
  return (
    <Sheet open={open} onClose={onClose} label={`Set ${setLabel} load`}>
      {open && <LoadSheetBody {...props} key={`${exercise.id}-${setLabel}`} />}
    </Sheet>
  );
}

function LoadSheetBody({
  onClose,
  exercise,
  setLabel,
  initialKg,
  initialPlatesKg,
  last,
  reps,
  recent,
  ptMax,
  cta,
  onSubmit,
}: LoadSheetProps) {
  const timed = exercise.loadMode === "TIME";
  const perSide = exercise.loadMode === "PER_SIDE";
  const cw = exercise.loadMode === "COUNTERWEIGHT";
  const carriage = exercise.carriageKgPerSide;
  const step = timed ? 1 : 2.5;

  const [mode, setMode] = useState<Mode>(perSide && initialPlatesKg != null ? "plates" : "side");
  const [value, setValue] = useState(() => {
    if (perSide && initialPlatesKg != null) return formatKg(initialPlatesKg);
    return initialKg == null ? "" : formatKg(initialKg);
  });
  // First keypress replaces the prefilled value.
  const [fresh, setFresh] = useState(true);
  const [tickKey, setTickKey] = useState(0);

  const entered = parse(value);
  const truth =
    entered == null ? null : perSide && mode === "plates" ? trueKg(exercise, entered) : roundKg(entered);

  const set = (v: string, isFresh: boolean) => {
    setValue(v);
    setFresh(isFresh);
    setTickKey((k) => k + 1);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (entered != null) {
      set(formatKg(next === "plates" ? platesFor(exercise, truth ?? 0) : truth ?? 0), true);
    }
    setMode(next);
  };

  const press = (k: (typeof KEYS)[number]) => {
    if (k === "del") {
      set(fresh ? "" : value.slice(0, -1), false);
      return;
    }
    const base = fresh ? "" : value;
    if (k === "." && (base.includes(".") || timed)) return;
    let next = base === "0" && k !== "." ? k : base + k;
    if (next === ".") next = "0.";
    if (next.replace(".", "").length > 5 || /\.\d{3,}$/.test(next)) return;
    set(next, false);
  };

  const adjust = (d: number) => set(formatKg(Math.max(0, roundKg((entered ?? 0) + d))), true);

  const pick = (kg: number) => {
    setMode("side");
    set(formatKg(kg), true);
  };

  const valid = truth != null && truth >= 0 && (!timed || truth > 0);
  const display = value === "" ? "0" : value;
  const unitLabel = timed
    ? "minutes"
    : perSide
      ? mode === "plates"
        ? `plates per side, plus ${carriage == null ? "?" : formatKg(carriage)} kg carriage, ${truth == null ? "—" : formatKg(truth)} in total`
        : `kg per side${carriage != null ? `, incl. ${formatKg(carriage)} kg carriage` : ""}`
      : cw
        ? "kg counterweight, lower = harder"
        : "kg on the stack";

  const ctaLabel =
    cta === "use"
      ? `Use ${truth == null ? "—" : formatKg(truth)}${timed ? " min" : ""}`
      : `${cta === "log" ? "Log" : "Save"} ${truth == null ? "—" : formatKg(truth)}${timed ? " min" : ""}${reps != null && !timed ? ` × ${reps}` : ""}`;

  const chips = Array.from(new Set(recent.map(roundKg)))
    .filter((k) => k !== ptMax)
    .slice(-3);

  return (
    <>
      <div className="flex justify-between items-center px-1.5">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h2 className="m-0 text-[17px] font-cta">
            {timed ? `Block ${setLabel}, minutes` : `Set ${setLabel}, load`}
          </h2>
          <span className="text-[13px] text-muted truncate">
            {exercise.name}
            {last && !timed && `, last ${formatKg(last.weight)} × ${last.reps}`}
            {last && timed && `, last ${last.reps} min`}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-11 h-11 -mr-1 rounded-full flex items-center justify-center shrink-0"
        >
          <span className="w-9 h-9 rounded-full bg-key text-fg-2 flex items-center justify-center">
            <CloseIcon size={16} strokeWidth={2.6} />
          </span>
        </button>
      </div>

      {perSide && (
        <div role="radiogroup" aria-label="Entry mode" className="seg">
          {(["plates", "side"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => switchMode(m)}
              className={cn("seg-btn", mode === m && "seg-on")}
            >
              {m === "plates" ? "Plates loaded" : "Per side"}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-[64px_1fr_64px] items-center gap-2 py-2">
        <button
          type="button"
          onClick={() => adjust(-step)}
          aria-label={`Minus ${step}${timed ? " minute" : " kg"}`}
          className="h-16 rounded-[20px] bg-surface-3 num text-[20px]"
        >
          −{step}
        </button>
        <div className="flex flex-col items-center gap-0.5 min-w-0" aria-live="polite">
          <span key={tickKey} className="num text-[76px] leading-[0.9] tracking-[-0.01em] animate-tick whitespace-nowrap">
            {display}
            <span
              aria-hidden
              className="inline-block w-[3px] h-14 ml-1 -mb-1 align-baseline rounded-sm bg-accent animate-blink"
            />
          </span>
          <span className="text-[13px] text-muted text-center">{unitLabel}</span>
        </div>
        <button
          type="button"
          onClick={() => adjust(step)}
          aria-label={`Plus ${step}${timed ? " minute" : " kg"}`}
          className="h-16 rounded-[20px] bg-surface-3 num text-[20px]"
        >
          +{step}
        </button>
      </div>

      {!timed && (chips.length > 0 || ptMax != null) && (
        <div className="flex gap-1.5 justify-center flex-wrap">
          <span className="text-xs text-muted self-center mr-0.5">Recent</span>
          {chips.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => pick(k)}
              className="h-11 px-3 rounded-full bg-surface text-fg-2 num text-[16px]"
            >
              {formatKg(k)}
            </button>
          ))}
          {ptMax != null && (
            <button
              type="button"
              onClick={() => pick(ptMax)}
              className="h-11 px-3 rounded-full bg-info-bg text-info num text-[16px]"
            >
              {formatKg(ptMax)}, PT max
            </button>
          )}
        </div>
      )}

      <div role="group" aria-label="Keypad" className="grid grid-cols-3 gap-1.5">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            aria-label={k === "del" ? "Delete" : k === "." ? "Decimal point" : k}
            disabled={k === "." && timed}
            className="h-[54px] rounded-[14px] bg-key active:bg-key-down font-display font-bold text-[26px] flex items-center justify-center disabled:opacity-30"
          >
            {k === "del" ? <BackspaceIcon size={22} /> : k}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="btn-primary"
        disabled={!valid}
        onClick={() => valid && onSubmit({ trueKg: truth!, platesKg: perSide && mode === "plates" ? entered : null })}
      >
        <CheckIcon size={20} strokeWidth={2.8} />
        {ctaLabel}
      </button>
    </>
  );
}
