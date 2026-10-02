"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { formatKg } from "@/domain/load";
import type { UnderloadNudge as Nudge } from "@/domain/progression";
import type { LiveItemView, LiveSetView, LogSetResult } from "@/server/sessions";
import { cn } from "@/lib/utils";
import { CheckIcon, CloseIcon } from "./icons";
import { RpePad } from "./rpe-pad";
import { UnderloadNudge } from "./underload-nudge";
import { LoadSheet } from "./load-sheet";

export interface LogInput {
  weight: number;
  platesKg: number | null;
  reps: number;
  rpe: number | null;
}
export type LogKind = "new" | "edit" | "rpe";

interface Draft {
  kg: string;
  reps: string;
  platesKg: number | null;
}

interface SetTableProps {
  item: LiveItemView;
  disabled: boolean;
  onLog: (index: number, input: LogInput, kind: LogKind) => Promise<LogSetResult | null>;
}

const GRID =
  "grid grid-cols-[32px_72px_minmax(0,1fr)_minmax(0,1fr)_52px_44px] gap-1.5 items-center px-0.5";
const BOX =
  "h-11 rounded-[10px] flex items-center justify-center font-display text-[22px] font-semibold tabular-nums";
const INPUT =
  "w-full h-11 rounded-[10px] bg-bg text-fg text-center font-display text-[22px] font-semibold tabular-nums placeholder:text-faint focus:outline-none";

/** "W1" for warm-ups, then 1, 2, 3 for working sets. */
function setLabels(sets: LiveSetView[]): string[] {
  let w = 0;
  let n = 0;
  return sets.map((s) => {
    const type = s.logged?.type ?? s.planned?.type ?? "working";
    return type === "warmup" ? `W${++w}` : String(++n);
  });
}

export function SetTable({ item, disabled, onLog }: SetTableProps) {
  const { exercise, sets } = item;
  const perSide = exercise.loadMode === "PER_SIDE";
  // Cardio: a set is a block of minutes. No load; "reps" holds the minutes.
  const timed = exercise.loadMode === "TIME";
  const unit = timed ? "" : exercise.loadMode === "COUNTERWEIGHT" ? "cw" : perSide ? "kg/side" : "kg";
  const labels = setLabels(sets);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [sheet, setSheet] = useState<{ index: number; kind: "new" | "edit" } | null>(null);
  const [nudge, setNudge] = useState<{ index: number; nudge: Nudge; weight: number; platesKg: number | null } | null>(null);
  const repsRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const activeIndex = sets.findIndex((s) => !s.logged);
  const rpeIndex = sets.reduce((acc, s) => (s.logged ? s.index : acc), -1);

  const repsPlaceholder = (s: LiveSetView) => s.planned?.reps[1] ?? s.last?.reps ?? null;

  const defaultDraft = (i: number, kind: "new" | "edit"): Draft => {
    const s = sets[i];
    if (kind === "edit" && s.logged) {
      return { kg: formatKg(s.logged.weight), reps: String(s.logged.reps), platesKg: s.logged.platesKg ?? null };
    }
    const prev = sets
      .slice(0, i)
      .reverse()
      .find((x) => x.logged)?.logged;
    if (timed) return { kg: "0", reps: "", platesKg: null };
    const kg = s.planned?.openKg ?? prev?.weight ?? s.last?.weight ?? null;
    return { kg: kg == null ? "" : formatKg(kg), reps: "", platesKg: null };
  };
  const dkey = (i: number, kind: "new" | "edit") => `${kind}:${i}`;
  const draftFor = (i: number, kind: "new" | "edit") => drafts[dkey(i, kind)] ?? defaultDraft(i, kind);
  const patchDraft = (i: number, kind: "new" | "edit", patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [dkey(i, kind)]: { ...draftFor(i, kind), ...d[dkey(i, kind)], ...patch } }));
  const clearDraft = (i: number, kind: "new" | "edit") =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[dkey(i, kind)];
      return next;
    });

  const commit = async (i: number, kind: "new" | "edit", override?: Partial<Draft>) => {
    const s = sets[i];
    const d = { ...draftFor(i, kind), ...override };
    const kg = parseFloat(d.kg);
    if (!Number.isFinite(kg) || kg < 0) {
      toast.error(`Enter the ${unit === "cw" ? "counterweight" : "load"} for set ${labels[i]}`);
      return;
    }
    const placeholder = repsPlaceholder(s);
    const reps = d.reps.trim() === "" ? placeholder : parseInt(d.reps, 10);
    if (reps == null || !Number.isFinite(reps) || reps < 0) {
      toast.error(timed ? `Enter minutes for block ${labels[i]}` : `Enter reps for set ${labels[i]}`);
      repsRefs.current[dkey(i, kind)]?.focus();
      return;
    }
    const res = await onLog(
      i,
      { weight: kg, platesKg: d.platesKg, reps, rpe: kind === "edit" ? s.logged?.rpe ?? null : null },
      kind
    );
    if (!res) return;
    clearDraft(i, kind);
    if (kind === "edit") setEditing(null);
    if (res.nudge) setNudge({ index: i, nudge: res.nudge, weight: res.set.weight, platesKg: res.set.platesKg ?? null });
    else if (nudge?.index === i) setNudge(null);
  };

  const pickRpe = async (i: number, rpe: number) => {
    const logged = sets[i]?.logged;
    if (!logged) return;
    const res = await onLog(
      i,
      { weight: logged.weight, platesKg: logged.platesKg ?? null, reps: logged.reps, rpe },
      "rpe"
    );
    if (!res) return;
    if (res.nudge) setNudge({ index: i, nudge: res.nudge, weight: res.set.weight, platesKg: res.set.platesKg ?? null });
    else if (nudge?.index === i) setNudge(null);
  };

  const sheetSet = sheet ? sets[sheet.index] : null;
  const sheetDraft = sheet ? draftFor(sheet.index, sheet.kind) : null;
  const sheetKg = sheetDraft ? parseFloat(sheetDraft.kg) : NaN;

  const kgCell = (i: number, kind: "new" | "edit") => {
    if (timed) {
      return (
        <span aria-hidden className={cn(INPUT, "border border-line text-faint flex items-center justify-center")}>
          —
        </span>
      );
    }
    const d = draftFor(i, kind);
    const label = `Set ${labels[i]} ${perSide ? "load per side" : unit === "cw" ? "counterweight" : "weight"}, kg`;
    if (perSide) {
      return (
        <button
          type="button"
          onClick={() => setSheet({ index: i, kind })}
          aria-label={`${label}: ${d.kg || "not set"}. Opens plate entry`}
          className={cn(INPUT, "border-2 border-accent")}
        >
          {d.kg || <span className="text-faint">—</span>}
        </button>
      );
    }
    return (
      <label className="relative block">
        <span className="sr-only">{label}</span>
        <input
          value={d.kg}
          inputMode="decimal"
          enterKeyHint="next"
          autoComplete="off"
          onChange={(e) => patchDraft(i, kind, { kg: e.target.value.replace(",", "."), platesKg: null })}
          onFocus={(e) => e.target.select()}
          className={cn(INPUT, "border-2 border-accent")}
        />
      </label>
    );
  };

  const repsCell = (i: number, kind: "new" | "edit") => {
    const d = draftFor(i, kind);
    const ph = repsPlaceholder(sets[i]);
    return (
      <label className="relative block">
        <span className="sr-only">Set {labels[i]} {timed ? "minutes" : "reps"}</span>
        <input
          ref={(el) => {
            repsRefs.current[dkey(i, kind)] = el;
          }}
          value={d.reps}
          placeholder={ph != null ? String(ph) : ""}
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          autoComplete="off"
          onChange={(e) => patchDraft(i, kind, { reps: e.target.value.replace(/\D/g, "") })}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit(i, kind);
            if (e.key === "Escape" && kind === "edit") setEditing(null);
          }}
          className={cn(INPUT, "border border-line-strong")}
        />
      </label>
    );
  };

  return (
    <div role="group" aria-label="Sets" className="flex flex-col gap-1.5">
      {unit === "cw" && (
        <p className="text-xs text-muted px-0.5">Counterweight — lower = harder.</p>
      )}
      <div aria-hidden className={cn(GRID, "text-[11px] text-muted uppercase tracking-[0.05em]")}>
        <span>Set</span>
        <span>Last</span>
        <span>{unit}</span>
        <span>{timed ? "Min" : "Reps"}</span>
        <span>RPE</span>
        <span />
      </div>

      {sets.map((s, i) => {
        const label = labels[i];
        const isEditing = editing === i && !!s.logged;
        const isActive = i === activeIndex;
        const isFuture = !s.logged && !isActive;
        const last = s.last
          ? timed
            ? `${s.last.reps} min`
            : `${formatKg(s.last.weight)} × ${s.last.reps}`
          : "—";

        let row: React.ReactNode;
        if (s.logged && !isEditing) {
          row = (
            <div
              role="group"
              aria-label={`Set ${label}, logged`}
              className={cn(GRID, "cursor-pointer")}
              onClick={() => !disabled && setEditing(i)}
            >
              <span className="font-display text-xl font-semibold tabular-nums">{label}</span>
              <span className="font-display text-[17px] text-muted tabular-nums truncate">{last}</span>
              <span className={cn(BOX, "bg-surface-2 text-muted")}>{timed ? "—" : formatKg(s.logged.weight)}</span>
              <span className={cn(BOX, "bg-surface-2 text-muted")}>{s.logged.reps}</span>
              <span className={cn(BOX, "bg-surface-2 text-muted")}>{s.logged.rpe ?? "—"}</span>
              <button
                type="button"
                aria-label={`Set ${label} done — edit`}
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(i);
                }}
                className="w-11 h-11 rounded-[10px] bg-info-bg flex items-center justify-center text-info"
              >
                <CheckIcon size={18} />
              </button>
            </div>
          );
        } else if (isEditing || isActive) {
          const kind = isEditing ? "edit" : "new";
          row = (
            <div role="group" aria-label={`Set ${label}${isEditing ? ", editing" : ""}`} className={GRID}>
              <span className="font-display text-xl font-semibold tabular-nums text-accent">{label}</span>
              <span className="font-display text-[17px] text-muted tabular-nums truncate">{last}</span>
              {kgCell(i, kind)}
              {repsCell(i, kind)}
              {isEditing ? (
                <button
                  type="button"
                  aria-label={`Cancel editing set ${label}`}
                  onClick={() => {
                    clearDraft(i, "edit");
                    setEditing(null);
                  }}
                  className="h-11 rounded-[10px] border border-line text-muted flex items-center justify-center"
                >
                  <CloseIcon size={16} />
                </button>
              ) : (
                <span aria-hidden className="h-11 rounded-[10px] border border-dashed border-line-strong flex items-center justify-center text-faint text-sm">
                  —
                </span>
              )}
              <button
                type="button"
                aria-label={isEditing ? `Save set ${label}` : `Mark set ${label} done`}
                disabled={disabled}
                onClick={() => void commit(i, kind)}
                className={cn(
                  "w-11 h-11 rounded-[10px] flex items-center justify-center disabled:opacity-50",
                  isEditing ? "bg-accent text-accent-ink" : "border border-line-strong text-faint hover:text-accent hover:border-accent"
                )}
              >
                <CheckIcon size={18} />
              </button>
            </div>
          );
        } else {
          row = (
            <div
              role="group"
              aria-label={`Set ${label}, planned`}
              className={cn(GRID, "opacity-55", isFuture && i === activeIndex + 1 && "pt-1.5")}
            >
              <span className="font-display text-xl font-semibold tabular-nums">{label}</span>
              <span className="font-display text-[17px] text-muted tabular-nums truncate">{last}</span>
              <span className={cn(BOX, "border border-line text-muted font-normal")}>
                {s.planned?.openKg != null ? formatKg(s.planned.openKg) : ""}
              </span>
              <span className={cn(BOX, "border border-line text-muted font-normal")}>
                {s.planned ? s.planned.reps[1] : ""}
              </span>
              <span className="h-11 rounded-[10px] border border-dashed border-line" />
              <span className="w-11 h-11" />
            </div>
          );
        }

        const showNudge = nudge && nudge.index === i;
        const next = sets[i + 1];
        return (
          <div key={i} className="flex flex-col gap-1.5">
            {row}
            {i === rpeIndex && s.logged && (
              <RpePad
                setLabel={label}
                value={s.logged.rpe}
                disabled={disabled}
                onPick={(v) => void pickRpe(i, v)}
              />
            )}
            {showNudge && (
              <UnderloadNudge
                nudge={nudge.nudge}
                currentKg={nudge.weight}
                nextSetLabel={next && !next.logged ? labels[i + 1] : null}
                onAccept={() => {
                  patchDraft(i + 1, "new", { kg: formatKg(nudge.nudge.suggestKg), platesKg: null });
                  setNudge(null);
                }}
                onKeep={() => {
                  if (next && !next.logged) {
                    patchDraft(i + 1, "new", { kg: formatKg(nudge.weight), platesKg: nudge.platesKg });
                  }
                  setNudge(null);
                }}
              />
            )}
          </div>
        );
      })}

      {perSide && sheet && sheetSet && sheetDraft && (
        <LoadSheet
          open
          onClose={() => setSheet(null)}
          exercise={exercise}
          setLabel={labels[sheet.index]}
          initialTrueKg={Number.isFinite(sheetKg) ? sheetKg : null}
          initialPlatesKg={sheetDraft.platesKg}
          lastTopKg={item.lastTopKg}
          willLog={sheetDraft.reps.trim() !== ""}
          disabled={disabled}
          onSubmit={({ trueKg, platesKg }) => {
            const { index, kind } = sheet;
            const patch = { kg: formatKg(trueKg), platesKg };
            setSheet(null);
            if (sheetDraft.reps.trim() !== "") {
              patchDraft(index, kind, patch);
              void commit(index, kind, patch);
            } else {
              patchDraft(index, kind, patch);
              requestAnimationFrame(() => repsRefs.current[dkey(index, kind)]?.focus());
            }
          }}
        />
      )}
    </div>
  );
}
