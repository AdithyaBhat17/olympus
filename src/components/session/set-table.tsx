"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatKg } from "@/domain/load";
import type { UnderloadNudge as Nudge } from "@/domain/progression";
import type { LiveItemView, LiveSetView, LogSetResult } from "@/server/sessions";
import { cn } from "@/lib/utils";
import { hapticTick } from "@/lib/haptics";
import { CheckIcon } from "./icons";
import { RpeStrip } from "./rpe-pad";
import { UnderloadNudge } from "./underload-nudge";
import { LoadSheet } from "./load-sheet";
import { MAX_REPS, RepsSheet } from "./reps-sheet";

export interface LogInput {
  weight: number;
  platesKg: number | null;
  reps: number;
  rpe: number | null;
}
export type LogKind = "new" | "edit" | "rpe";

interface Draft {
  kg?: number;
  platesKg?: number | null;
  reps?: number;
}

interface SetTableProps {
  item: LiveItemView;
  /** Optimistic: applies immediately; resolves with the server's answer (null if queued or rejected). */
  onLog: (index: number, input: LogInput, kind: LogKind) => Promise<LogSetResult | null>;
  onUndoLast: () => void;
  /** The load the next set will log, so the hero above can show it (and its plates). */
  onActiveKg?: (kg: number | null) => void;
}

const GRID = "grid grid-cols-[38px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_52px] gap-1.5 items-center";
const CELL =
  "h-12 rounded-2xl flex items-center justify-center num text-[24px] min-w-0";

/** "W1" for warm-ups, then 1, 2, 3 for working sets. */
export function setLabels(sets: LiveSetView[]): string[] {
  let w = 0;
  let n = 0;
  return sets.map((s) => {
    const type = s.logged?.type ?? s.planned?.type ?? "working";
    return type === "warmup" ? `W${++w}` : String(++n);
  });
}

export function SetTable({ item, onLog, onUndoLast, onActiveKg }: SetTableProps) {
  const { exercise, sets } = item;
  const timed = exercise.loadMode === "TIME";
  const unit = timed ? "—" : exercise.loadMode === "COUNTERWEIGHT" ? "Counter" : exercise.loadMode === "PER_SIDE" ? "kg a side" : "kg";
  const labels = setLabels(sets);

  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [sheetIndex, setSheetIndex] = useState<number | null>(null);
  const [repsIndex, setRepsIndex] = useState<number | null>(null);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const [nudge, setNudge] = useState<{ index: number; nudge: Nudge; weight: number; platesKg: number | null } | null>(null);
  const [just, setJust] = useState<number | null>(null);

  const activeIndex = sets.findIndex((s) => !s.logged);
  const lastLogged = sets.reduce((acc, s) => (s.logged ? s.index : acc), -1);
  const [rpeFor, setRpeFor] = useState<number>(lastLogged);
  useEffect(() => {
    if (rpeFor > lastLogged || (rpeFor >= 0 && !sets[rpeFor]?.logged)) setRpeFor(lastLogged);
  }, [lastLogged, rpeFor, sets]);

  useEffect(() => {
    if (just == null) return;
    const t = window.setTimeout(() => setJust(null), 600);
    return () => window.clearTimeout(t);
  }, [just]);

  /**
   * What each set will log if ✓ is tapped now. kg: plan → last session →
   * previous set. reps: plan → last session → previous set.
   */
  const values = useMemo(() => {
    const out: Array<{ kg: number | null; platesKg: number | null; reps: number | null; defaultKg: number | null }> = [];
    sets.forEach((s, i) => {
      const prev = out[i - 1];
      if (s.logged) {
        out.push({ kg: s.logged.weight, platesKg: s.logged.platesKg ?? null, reps: s.logged.reps, defaultKg: s.logged.weight });
        return;
      }
      const defaultKg = timed ? 0 : s.planned?.openKg ?? s.last?.weight ?? prev?.kg ?? null;
      const d = drafts[i] ?? {};
      out.push({
        kg: d.kg ?? defaultKg,
        platesKg: d.kg != null ? d.platesKg ?? null : null,
        reps: d.reps ?? s.planned?.reps[1] ?? s.last?.reps ?? prev?.reps ?? null,
        defaultKg,
      });
    });
    return out;
  }, [sets, drafts, timed]);

  // Report the next set's load (or the last one logged, once all are done) to the hero.
  const heroKg = activeIndex >= 0 ? values[activeIndex]?.kg ?? null : values[lastLogged]?.kg ?? null;
  useEffect(() => {
    onActiveKg?.(heroKg);
  }, [heroKg, onActiveKg]);

  const patchDraft = (i: number, patch: Draft) => setDrafts((d) => ({ ...d, [i]: { ...d[i], ...patch } }));
  const clearDraft = (i: number) =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[i];
      return next;
    });

  const handleResult = (i: number, res: LogSetResult | null) => {
    if (!res) return;
    if (res.nudge) setNudge({ index: i, nudge: res.nudge, weight: res.set.weight, platesKg: res.set.platesKg ?? null });
    else setNudge((n) => (n?.index === i ? null : n));
  };

  const log = (i: number) => {
    const v = values[i];
    if (v.kg == null || v.reps == null) {
      // Nothing to prefill from (first time on this exercise): ask for the load.
      setSheetIndex(i);
      return;
    }
    hapticTick();
    setJust(i);
    setRpeFor(i);
    // A changed load carries forward to later sets that would have matched it.
    if (v.kg !== v.defaultKg) {
      setDrafts((d) => {
        const next = { ...d };
        delete next[i];
        for (let j = i + 1; j < sets.length; j++) {
          if (!sets[j].logged && next[j]?.kg == null && values[j].defaultKg === v.defaultKg) {
            next[j] = { ...next[j], kg: v.kg!, platesKg: v.platesKg };
          }
        }
        return next;
      });
    } else {
      clearDraft(i);
    }
    void onLog(i, { weight: v.kg, platesKg: v.platesKg, reps: v.reps, rpe: null }, "new").then((r) => handleResult(i, r));
  };

  const setReps = (i: number, reps: number) => {
    const s = sets[i];
    if (s.logged) {
      void onLog(
        i,
        { weight: s.logged.weight, platesKg: s.logged.platesKg ?? null, reps, rpe: s.logged.rpe ?? null },
        "edit"
      ).then((r) => handleResult(i, r));
    } else {
      patchDraft(i, { reps });
    }
  };

  const startPress = (i: number) => {
    longPressed.current = false;
    if (timed) return;
    cancelPress();
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      hapticTick();
      setRepsIndex(i);
    }, 450);
  };
  const cancelPress = () => {
    if (pressTimer.current != null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const bumpReps = (i: number) => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    const s = sets[i];
    if (timed) {
      setSheetIndex(i);
      return;
    }
    const cur = values[i].reps ?? 0;
    const reps = cur >= MAX_REPS ? 1 : cur + 1;
    if (s.logged) {
      void onLog(
        i,
        { weight: s.logged.weight, platesKg: s.logged.platesKg ?? null, reps, rpe: s.logged.rpe ?? null },
        "edit"
      ).then((r) => handleResult(i, r));
    } else {
      patchDraft(i, { reps });
    }
  };

  const pickRpe = (i: number, rpe: number | null) => {
    const logged = sets[i]?.logged;
    if (!logged) return;
    hapticTick();
    void onLog(i, { weight: logged.weight, platesKg: logged.platesKg ?? null, reps: logged.reps, rpe }, "rpe").then(
      (r) => handleResult(i, r)
    );
  };

  const tapCheck = (i: number) => {
    const s = sets[i];
    if (!s.logged) return log(i);
    if (i === lastLogged) return onUndoLast();
    setRpeFor(i);
  };

  // --- sheet ---------------------------------------------------------------
  const sheetSet = sheetIndex != null ? sets[sheetIndex] : null;
  const sheetVal = sheetIndex != null ? values[sheetIndex] : null;
  const recent = useMemo(() => {
    const r: number[] = [];
    for (const s of sets) {
      if (s.last) r.push(s.last.weight);
      if (s.logged) r.push(s.logged.weight);
    }
    if (item.lastTopKg != null) r.push(item.lastTopKg);
    return r;
  }, [sets, item.lastTopKg]);
  const ptMax = useMemo(() => {
    const planned = sets.map((s) => s.planned?.openKg).filter((k): k is number => k != null);
    if (!planned.length) return null;
    return exercise.loadMode === "COUNTERWEIGHT" ? Math.min(...planned) : Math.max(...planned);
  }, [sets, exercise.loadMode]);

  const submitSheet = ({ trueKg, platesKg }: { trueKg: number; platesKg: number | null }) => {
    if (sheetIndex == null || !sheetSet || !sheetVal) return;
    const i = sheetIndex;
    setSheetIndex(null);
    if (timed) {
      if (sheetSet.logged) {
        void onLog(i, { weight: 0, platesKg: null, reps: Math.round(trueKg), rpe: sheetSet.logged.rpe ?? null }, "edit");
      } else {
        patchDraft(i, { reps: Math.round(trueKg) });
        if (i === activeIndex) {
          hapticTick();
          setJust(i);
          setRpeFor(i);
          clearDraft(i);
          void onLog(i, { weight: 0, platesKg: null, reps: Math.round(trueKg), rpe: null }, "new");
        }
      }
      return;
    }
    if (sheetSet.logged) {
      void onLog(
        i,
        { weight: trueKg, platesKg, reps: sheetSet.logged.reps, rpe: sheetSet.logged.rpe ?? null },
        "edit"
      ).then((r) => handleResult(i, r));
      return;
    }
    patchDraft(i, { kg: trueKg, platesKg });
    if (i === activeIndex && sheetVal.reps != null) {
      hapticTick();
      setJust(i);
      setRpeFor(i);
      setDrafts((d) => {
        const next = { ...d };
        delete next[i];
        for (let j = i + 1; j < sets.length; j++) {
          if (!sets[j].logged && next[j]?.kg == null && values[j].defaultKg === sheetVal.defaultKg) {
            next[j] = { ...next[j], kg: trueKg, platesKg };
          }
        }
        return next;
      });
      void onLog(i, { weight: trueKg, platesKg, reps: sheetVal.reps, rpe: null }, "new").then((r) => handleResult(i, r));
    }
  };

  const rpeSet = rpeFor >= 0 ? sets[rpeFor] : null;

  return (
    <div className="flex flex-col gap-1">
      {exercise.loadMode === "COUNTERWEIGHT" && (
        <p className="m-0 px-1 pb-1 text-[13px] font-semibold text-info">Counterweight: lower is harder.</p>
      )}
      <div role="table" aria-label="Sets" className="flex flex-col gap-1">
        <div role="row" className={cn(GRID, "px-1 text-[13px] font-semibold text-muted text-center")}>
          <span role="columnheader">Set</span>
          <span role="columnheader">Last</span>
          <span role="columnheader">{unit}</span>
          <span role="columnheader">{timed ? "Min" : "Reps"}</span>
          <span role="columnheader">
            <span className="sr-only">Done</span>
          </span>
        </div>

        {sets.map((s, i) => {
          const v = values[i];
          const done = !!s.logged;
          const active = i === activeIndex;
          const label = labels[i];
          const last = s.last ? (timed ? `${s.last.reps}m` : `${formatKg(s.last.weight)}×${s.last.reps}`) : "—";
          return (
            <div key={i} className="flex flex-col gap-1">
              <div
                role="row"
                className={cn(
                  GRID,
                  "p-1 rounded-[26px] transition-colors duration-200",
                  active && "bg-surface",
                  !active && !done && "opacity-60"
                )}
              >
                <span role="cell" className={cn("num text-center text-[17px]", active ? "text-k-text" : "text-muted")}>
                  {label}
                </span>
                <span role="cell" className="num text-center text-[15px] text-muted truncate">
                  {last}
                </span>
                <span role="cell" className="min-w-0">
                  {timed ? (
                    <span className={cn(CELL, "text-faint")} aria-hidden>
                      —
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSheetIndex(i)}
                      aria-label={`Set ${label} load ${v.kg != null ? formatKg(v.kg) : "not set"}. Change load`}
                      className={cn(CELL, "w-full", active && "bg-bg", done ? "text-muted" : "text-fg")}
                    >
                      {v.kg != null ? formatKg(v.kg) : <span className="text-faint">—</span>}
                    </button>
                  )}
                </span>
                <span role="cell" className="min-w-0">
                  <button
                    type="button"
                    onClick={() => bumpReps(i)}
                    onPointerDown={() => startPress(i)}
                    onPointerUp={cancelPress}
                    onPointerLeave={cancelPress}
                    onPointerCancel={cancelPress}
                    onContextMenu={(e) => e.preventDefault()}
                    aria-label={
                      timed
                        ? `Block ${label}: ${v.reps ?? "no"} minutes. Change`
                        : `Set ${label}: ${v.reps ?? "no"} reps. Tap to add one, hold to edit`
                    }
                    className={cn(CELL, "w-full", active && "bg-bg", done ? "text-muted" : "text-fg")}
                  >
                    {v.reps ?? <span className="text-faint">—</span>}
                  </button>
                </span>
                <span role="cell" className="relative">
                  <button
                    type="button"
                    onClick={() => tapCheck(i)}
                    disabled={!done && !active}
                    aria-label={
                      done
                        ? i === lastLogged
                          ? `Set ${label} logged. Undo`
                          : `Set ${label} logged. Rate effort`
                        : `Log set ${label}: ${v.kg != null ? formatKg(v.kg) : "—"} × ${v.reps ?? "—"}`
                    }
                    className={cn(
                      "w-12 h-12 mx-auto rounded-full flex items-center justify-center disabled:opacity-100",
                      done ? "bg-k text-k-on" : active ? "bg-bg text-k-text breathe" : "text-faint ring-2 ring-inset ring-surface-3"
                    )}
                  >
                    <CheckIcon size={22} strokeWidth={2.8} className={done ? "animate-pop" : undefined} />
                  </button>
                  {just === i && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 mx-auto w-12 rounded-full shadow-[0_0_0_3px_rgb(var(--k))] animate-burst"
                    />
                  )}
                </span>
              </div>
              {nudge?.index === i && (
                <UnderloadNudge
                  nudge={nudge.nudge}
                  currentKg={nudge.weight}
                  nextSetLabel={sets[i + 1] && !sets[i + 1].logged ? labels[i + 1] : null}
                  onAccept={() => {
                    patchDraft(i + 1, { kg: nudge.nudge.suggestKg, platesKg: null });
                    setNudge(null);
                  }}
                  onKeep={() => {
                    if (sets[i + 1] && !sets[i + 1].logged) {
                      patchDraft(i + 1, { kg: nudge.weight, platesKg: nudge.platesKg });
                    }
                    setNudge(null);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {rpeSet?.logged && (
        <RpeStrip
          key={rpeFor}
          setLabel={labels[rpeFor]}
          value={rpeSet.logged.rpe}
          onPick={(v) => pickRpe(rpeFor, v)}
        />
      )}

      {repsIndex != null && sets[repsIndex] && (
        <RepsSheet
          open
          onClose={() => setRepsIndex(null)}
          setLabel={labels[repsIndex]}
          exerciseName={exercise.name}
          initial={values[repsIndex]?.reps ?? null}
          onSubmit={(reps) => {
            setReps(repsIndex, reps);
            setRepsIndex(null);
          }}
        />
      )}

      {sheetSet && sheetVal && (
        <LoadSheet
          open
          onClose={() => setSheetIndex(null)}
          exercise={exercise}
          setLabel={labels[sheetIndex!]}
          initialKg={timed ? sheetVal.reps : sheetVal.kg}
          initialPlatesKg={timed ? null : sheetVal.platesKg}
          last={sheetSet.last}
          reps={sheetVal.reps}
          recent={recent}
          ptMax={ptMax}
          cta={sheetSet.logged ? "save" : sheetIndex === activeIndex && (timed || sheetVal.reps != null) ? "log" : "use"}
          onSubmit={submitSheet}
        />
      )}
    </div>
  );
}
