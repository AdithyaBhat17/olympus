"use client";

import { useEffect, useState } from "react";
import { formatKg, platesFor, roundKg, trueKg } from "@/domain/load";
import type { ExerciseMeta } from "@/server/sessions";
import { cn } from "@/lib/utils";
import { Sheet } from "./sheet";
import { BackspaceIcon, InfoIcon, WarnIcon } from "./icons";

type Mode = "plates" | "true";

export interface LoadSheetValue {
  trueKg: number;
  /** Set when the user entered plates; log with platesKg so the server does the maths. */
  platesKg: number | null;
}

interface LoadSheetProps {
  open: boolean;
  onClose: () => void;
  exercise: ExerciseMeta;
  setLabel: string;
  initialTrueKg: number | null;
  initialPlatesKg: number | null;
  lastTopKg: number | null;
  /** Reps already known → CTA logs the set; otherwise it just fills the kg. */
  willLog: boolean;
  disabled?: boolean;
  onSubmit: (v: LoadSheetValue) => void;
}

const QUICK = [-2.5, -1.25, 1.25, 2.5] as const;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"] as const;

function parse(v: string): number | null {
  if (v === "" || v === ".") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function LoadSheet(props: LoadSheetProps) {
  const { open, onClose, exercise, setLabel } = props;
  return (
    <Sheet open={open} onClose={onClose} label="Enter load">
      {open && <LoadSheetBody {...props} key={`${exercise.id}-${setLabel}`} />}
    </Sheet>
  );
}

function LoadSheetBody({
  exercise,
  setLabel,
  initialTrueKg,
  initialPlatesKg,
  lastTopKg,
  willLog,
  disabled,
  onSubmit,
}: LoadSheetProps) {
  const [mode, setMode] = useState<Mode>(
    initialPlatesKg != null || initialTrueKg == null ? "plates" : "true"
  );
  const [value, setValue] = useState(() => {
    if (initialPlatesKg != null) return formatKg(initialPlatesKg);
    if (initialTrueKg == null) return "";
    return formatKg(platesFor(exercise, initialTrueKg));
  });
  // First keypress replaces the prefilled value.
  const [fresh, setFresh] = useState(true);

  const carriage = exercise.carriageKgPerSide;
  const entered = parse(value);
  const plates = entered == null ? null : mode === "plates" ? entered : platesFor(exercise, entered);
  const truth = entered == null ? null : mode === "plates" ? trueKg(exercise, entered) : roundKg(entered);

  useEffect(() => setFresh(true), [mode]);

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (entered != null) setValue(formatKg(next === "plates" ? plates ?? 0 : truth ?? 0));
    setMode(next);
  };

  const press = (k: (typeof KEYS)[number]) => {
    setValue((cur) => {
      const base = fresh ? "" : cur;
      if (k === "." && base.includes(".")) return base;
      const next = base === "0" && k !== "." ? k : base + k;
      if (next.replace(".", "").length > 5) return base;
      if (/\.\d{3,}$/.test(next)) return base;
      return next === "." ? "0." : next;
    });
    setFresh(false);
  };

  const backspace = () => {
    setValue((cur) => (fresh ? "" : cur.slice(0, -1)));
    setFresh(false);
  };

  const adjust = (d: number) => {
    setValue(formatKg(Math.max(0, roundKg((entered ?? 0) + d))));
    setFresh(true);
  };

  const hitsTarget = truth != null && lastTopKg != null && roundKg(truth) === roundKg(lastTopKg);
  const valid = truth != null && truth >= 0;

  return (
    <>
      <div className="flex justify-between items-center gap-3">
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] text-muted truncate">
            Set {setLabel} · {exercise.name}
          </span>
          <span className="font-semibold">{mode === "plates" ? "Plates per side" : "True load per side"}</span>
        </div>
        <div role="radiogroup" aria-label="Entry mode" className="flex bg-bg rounded-[10px] p-[3px] shrink-0">
          {(["plates", "true"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => switchMode(m)}
              className={cn(
                "h-11 px-3 rounded-lg text-[13px]",
                mode === m ? "bg-line font-semibold" : "text-muted"
              )}
            >
              {m === "plates" ? "Plates" : "True load"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-stretch gap-2" aria-live="polite">
        <div
          className={cn(
            "flex-1 min-w-0 p-3.5 rounded-[14px] flex flex-col gap-0.5",
            mode === "plates" ? "border-2 border-accent bg-bg" : "bg-surface-2"
          )}
        >
          <span className="text-xs text-muted">Plates</span>
          <span className="font-display text-[40px] font-bold leading-none tabular-nums truncate">
            {plates == null ? "—" : formatKg(plates)}
          </span>
        </div>
        <div aria-hidden className="flex items-center font-display text-[28px] text-muted">+</div>
        <div className="flex-1 min-w-0 p-3.5 rounded-[14px] bg-surface-2 flex flex-col gap-0.5">
          <span className="text-xs text-muted">Carriage</span>
          <span className="font-display text-[40px] font-semibold leading-none tabular-nums text-muted">
            {carriage == null ? "?" : formatKg(carriage)}
          </span>
        </div>
        <div aria-hidden className="flex items-center font-display text-[28px] text-muted">=</div>
        <div
          className={cn(
            "flex-1 min-w-0 p-3.5 rounded-[14px] bg-accent-bg flex flex-col gap-0.5",
            mode === "true" ? "border-2 border-accent" : "border border-accent-line"
          )}
        >
          <span className="text-xs text-accent-soft">True / side</span>
          <span className="font-display text-[40px] font-bold leading-none tabular-nums truncate">
            {truth == null ? "—" : formatKg(truth)}
          </span>
        </div>
      </div>

      {carriage == null ? (
        <div className="flex gap-2.5 items-center px-3 py-2.5 rounded-[10px] bg-danger-bg border border-danger-line text-[13px] text-danger-text leading-[1.4]">
          <WarnIcon size={18} className="shrink-0 text-danger-soft" />
          <span>Calibrate carriage in Library — true load assumes a 0 kg carriage until you do.</span>
        </div>
      ) : (
        <div className="flex gap-2.5 items-center px-3 py-2.5 rounded-[10px] bg-surface-2 text-[13px] text-fg-2 leading-[1.4]">
          <InfoIcon size={18} className="shrink-0 text-info" />
          <span>
            {lastTopKg == null
              ? "No previous session on this machine."
              : hitsTarget
                ? `Hits target ${formatKg(lastTopKg)}/side from last session.`
                : `Last session's top set: ${formatKg(lastTopKg)}/side.`}{" "}
            Carriage is saved per machine; edit it in Library.
          </span>
        </div>
      )}

      <div role="group" aria-label="Quick adjust" className="grid grid-cols-4 gap-2">
        {QUICK.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => adjust(d)}
            className="h-11 rounded-[10px] border border-line bg-surface-2 font-display text-lg font-semibold tabular-nums"
          >
            {d > 0 ? `+${d}` : `−${Math.abs(d)}`}
          </button>
        ))}
      </div>

      <div role="group" aria-label="Keypad" className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="h-[52px] rounded-xl bg-line font-display text-[26px] font-semibold active:bg-line-strong"
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          aria-label="Delete"
          onClick={backspace}
          className="h-[52px] rounded-xl bg-line flex items-center justify-center active:bg-line-strong"
        >
          <BackspaceIcon size={22} />
        </button>
      </div>

      <button
        type="button"
        className="btn-primary"
        disabled={!valid || disabled}
        onClick={() => valid && onSubmit({ trueKg: truth!, platesKg: mode === "plates" ? plates : null })}
      >
        {willLog ? "Log" : "Use"} {truth == null ? "—" : formatKg(truth)} kg / side
      </button>
    </>
  );
}
