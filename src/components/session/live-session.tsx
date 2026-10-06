"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trueKg } from "@/domain/load";
import type { SetLogEntry } from "@/domain/types";
import type { LiveItemView, LogSetResult, SessionView } from "@/server/sessions";
import { createExerciseAction, discardSessionAction, swapExerciseAction } from "@/lib/liftlog-actions";
import { mutate } from "@/lib/offline/mutate";
import { subscribePending } from "@/lib/offline/outbox";
import { useWakeLock } from "@/lib/wake-lock";
import { adhocItemKey, cn, kindClass } from "@/lib/utils";
import { ChevronDownIcon, WarnIcon } from "./icons";
import { Elapsed, RestPill, loadRest, saveRest, type RestState } from "./timers";
import { ExerciseCard } from "./exercise-card";
import { SetTable, setLabels, type LogInput, type LogKind } from "./set-table";
import { CompletedList, UpNextList } from "./session-lists";
import { SwapSheet, type SwapCandidate } from "./swap-sheet";
import { candidateMeta, canRemoveAdded, loadAdded, saveAdded, withAddedItems } from "./added-exercises";
import { Sheet } from "./sheet";

/** Optimistic set edits per item key: index → entry (null = removed). */
type Overlay = Record<string, Record<number, SetLogEntry | null>>;
/** Optimistic swaps per item key. */
type SwapOverlay = Record<string, LiveItemView>;

interface LiveSessionProps {
  view: SessionView;
  swap: { candidates: SwapCandidate[]; constraintRegions: string[] };
}

function mergeItem(
  it: LiveItemView,
  ov: Record<number, SetLogEntry | null> | undefined,
  minCount: number
): LiveItemView {
  const ovIdx = ov
    ? Object.entries(ov)
        .filter(([, v]) => v != null)
        .map(([k]) => Number(k))
    : [];
  const count = Math.max(it.sets.length, ...ovIdx.map((i) => i + 1), minCount);
  const sets = Array.from({ length: count }, (_, i) => {
    const base = it.sets[i] ?? { index: i, planned: null, logged: null, last: null };
    const logged = ov && i in ov ? ov[i] : base.logged;
    return { ...base, index: i, logged };
  });
  const planned = sets.filter((s) => s.planned).length;
  const logged = sets.filter((s) => s.logged).length;
  return { ...it, sets, done: planned > 0 ? logged >= planned : logged > 0 };
}

/** Logged / planned for the progress segment. */
function itemProgress(it: LiveItemView): number {
  const planned = Math.max(1, it.sets.filter((s) => s.planned).length || it.sets.length);
  return Math.min(1, it.sets.filter((s) => s.logged).length / planned);
}

export function LiveSession({ view, swap }: LiveSessionProps) {
  const router = useRouter();
  useWakeLock(true);

  const [overlay, setOverlay] = useState<Overlay>({});
  const [swaps, setSwaps] = useState<SwapOverlay>({});
  const [setCounts, setSetCounts] = useState<Record<string, number>>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** The exercise picker: swapping out an item, or adding one to the session. */
  const [picker, setPicker] = useState<{ swapKey: string } | "add" | null>(null);
  const [added, setAddedState] = useState<string[]>([]);
  const [noteOpen, setNoteOpen] = useState(false);
  const [notes, setNotes] = useState(view.notes ?? "");
  const [rest, setRestState] = useState<RestState | null>(null);
  const [pending, setPending] = useState(0);
  const [activeKg, setActiveKg] = useState<number | null>(null);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;

  useEffect(() => subscribePending(setPending), []);
  useEffect(() => setNotes(view.notes ?? ""), [view.notes]);

  // No rubber-band / pull-to-refresh mid-set.
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overscrollBehavior;
    html.style.overscrollBehavior = "none";
    return () => {
      html.style.overscrollBehavior = prev;
    };
  }, []);

  // Rest timer and added exercises survive reloads via localStorage (read after mount only).
  useEffect(() => {
    setRestState(loadRest(view.id));
    setAddedState(loadAdded(view.id));
  }, [view.id]);
  const setRest = useCallback(
    (next: RestState | null) => {
      setRestState(next);
      saveRest(view.id, next);
    },
    [view.id]
  );
  const skipRest = useCallback(() => setRest(null), [setRest]);
  const setAdded = useCallback(
    (ids: string[]) => {
      setAddedState(ids);
      saveAdded(view.id, ids);
    },
    [view.id]
  );

  // Exercises created mid-session, until the next server view lists them.
  const [created, setCreated] = useState<SwapCandidate[]>([]);
  const candidateById = useMemo(
    () => new Map([...created, ...swap.candidates].map((c) => [c.id, c])),
    [created, swap.candidates]
  );
  const baseItems = useMemo(
    () => withAddedItems(view.items, added, candidateById),
    [view.items, added, candidateById]
  );

  // Drop optimistic entries the server view now reflects.
  useEffect(() => {
    setOverlay((prev) => {
      const next: Overlay = {};
      let dropped = false;
      for (const [key, entries] of Object.entries(prev)) {
        const serverItem = baseItems.find((x) => x.key === key);
        for (const [k, v] of Object.entries(entries)) {
          const server = serverItem?.sets[Number(k)]?.logged ?? null;
          const reflected =
            v === null
              ? server === null
              : server != null && server.reps === v.reps && server.weight === v.weight && (server.rpe ?? null) === (v.rpe ?? null);
          if (!reflected) (next[key] ??= {})[Number(k)] = v;
          else dropped = true;
        }
      }
      return dropped ? next : prev;
    });
  }, [baseItems]);
  useEffect(() => setSwaps({}), [view]);

  const items = useMemo(
    () =>
      baseItems.map((it) =>
        mergeItem(swaps[it.key] ?? it, swaps[it.key] ? undefined : overlay[it.key], setCounts[it.key] ?? 0)
      ),
    [baseItems, overlay, swaps, setCounts]
  );

  const current =
    (selectedKey ? items.find((i) => i.key === selectedKey) : undefined) ?? items.find((i) => !i.done) ?? null;
  const currentIdx = current ? items.indexOf(current) : -1;
  const completed = items.filter((i) => i.done && i.key !== current?.key);
  const upNext = items.filter((i) => !i.done && i.key !== current?.key);
  const nextItem = current ? items.slice(currentIdx + 1).find((i) => !i.done) ?? upNext[0] ?? null : null;
  const swapKey = picker && picker !== "add" ? picker.swapKey : null;
  const swapItem = swapKey ? items.find((i) => i.key === swapKey) ?? null : null;
  const positions = useMemo(() => new Map(items.map((it, i) => [it.key, i + 1])), [items]);

  const restNext = useMemo(() => {
    if (!current) return null;
    const idx = current.sets.findIndex((s) => !s.logged);
    if (idx >= 0) return `set ${setLabels(current.sets)[idx]}`;
    return nextItem ? nextItem.exercise.name : null;
  }, [current, nextItem]);

  const typeLabel = view.sessionType ? `Session ${view.sessionType}` : null;
  const headerTitle =
    typeLabel && !view.title.startsWith("Session ") ? `${typeLabel}, ${view.title}` : view.title;

  const putOverlay = (key: string, index: number, v: SetLogEntry | null | undefined) =>
    setOverlay((prev) => {
      const entries = { ...(prev[key] ?? {}) };
      if (v === undefined) delete entries[index];
      else entries[index] = v;
      return { ...prev, [key]: entries };
    });

  const onLog = async (item: LiveItemView, index: number, input: LogInput, kind: LogKind): Promise<LogSetResult | null> => {
    const s = item.sets[index];
    const type = s?.logged?.type ?? s?.planned?.type ?? "working";
    const weight = input.platesKg != null ? trueKg(item.exercise, input.platesKg) : input.weight;
    const prev = overlayRef.current[item.key];
    const before = prev && index in prev ? prev[index] : undefined;

    let result: LogSetResult | null = null;
    await mutate<LogSetResult>(
      {
        kind: "logSet",
        sessionId: view.id,
        input: {
          exerciseId: item.exercise.id,
          planItemId: item.planItemId,
          setIndex: index,
          reps: input.reps,
          rpe: input.rpe,
          type,
          blockedOverride: item.blockedReason ? true : undefined,
          ...(input.platesKg != null ? { platesKg: input.platesKg } : { weight: input.weight }),
        },
      },
      {
        apply: () => {
          putOverlay(item.key, index, {
            reps: input.reps,
            weight,
            platesKg: input.platesKg,
            rpe: input.rpe,
            type,
            flags: s?.logged?.flags,
            doneAt: s?.logged?.doneAt ?? new Date().toISOString(),
          });
          if (kind === "new") {
            setSelectedKey(item.key);
            setRest({
              endAt: Date.now() + item.restSec * 1000,
              totalSec: item.restSec,
              label: item.exercise.isCompound ? "Rest after a big lift" : "Rest",
            });
          }
        },
        rollback: () => {
          putOverlay(item.key, index, before);
          if (kind === "new") setRest(null);
        },
        onOk: (data) => {
          putOverlay(item.key, index, data.set);
          result = data;
        },
      }
    );
    return result;
  };

  const addSet = (item: LiveItemView) => {
    setSetCounts((c) => ({ ...c, [item.key]: item.sets.length + 1 }));
    setSelectedKey(item.key);
  };

  const lastLoggedIndex = (item: LiveItemView) => item.sets.reduce((acc, s) => (s.logged ? s.index : acc), -1);

  const removeLastSet = (item: LiveItemView) => {
    const last = item.sets[item.sets.length - 1];
    if (last && !last.logged && !last.planned && item.sets.length > 1) {
      setSetCounts((c) => ({ ...c, [item.key]: item.sets.length - 1 }));
      return;
    }
    const idx = lastLoggedIndex(item);
    if (idx < 0) return;
    const prev = overlayRef.current[item.key];
    const before = prev && idx in prev ? prev[idx] : undefined;
    void mutate(
      {
        kind: "removeSet",
        sessionId: view.id,
        input: { exerciseId: item.exercise.id, planItemId: item.planItemId, setIndex: idx },
      },
      {
        apply: () => {
          putOverlay(item.key, idx, null);
          setSetCounts((c) => ({ ...c, [item.key]: Math.min(c[item.key] ?? 0, item.sets.length - 1) }));
          setRest(null);
          toast(`Set ${setLabels(item.sets)[idx]} removed`, { id: "set-removed" });
        },
        rollback: () => putOverlay(item.key, idx, before),
      }
    );
  };

  /** Optimistic swap: show the new exercise now, reconcile on the next server view. */
  const doSwap = async (c: SwapCandidate, note?: string) => {
    if (!swapItem?.planItemId) return;
    // The server flags a blocked swap for the PT and wants a reason for it.
    const overrideReason = c.blocked ? note || "Athlete's call" : null;
    const exerciseId = c.id;
    const item = swapItem;
    setPicker(null);
    setSelectedKey(item.key);
    setSwaps((s) => ({
      ...s,
      [item.key]: {
        ...item,
        swapped: true,
        plannedExercise: item.plannedExercise ?? item.exercise,
        exercise: candidateMeta(c),
        blockedReason: c.blockedReason,
        lastTopKg: c.lastKg,
        sets: item.sets.map((s) => ({
          ...s,
          logged: null,
          last: null,
          planned: s.planned ? { ...s.planned, openKg: c.lastKg ?? undefined } : null,
        })),
      },
    }));
    const rollback = () =>
      setSwaps((s) => {
        const next = { ...s };
        delete next[item.key];
        return next;
      });
    try {
      const res = await swapExerciseAction(view.id, {
        planItemId: item.planItemId!,
        exerciseId,
        overrideReason,
      });
      if (!res.ok) {
        rollback();
        toast.error(res.error);
        return;
      }
      toast.success(overrideReason ? "Swapped and flagged for your PT" : "Exercise swapped");
      // Swapped onto an exercise added here but not started: one card, not two.
      const dup = items.find((i) => i.exercise.id === exerciseId && canRemoveAdded(i, added));
      if (dup) dropAdded(dup);
      router.refresh();
    } catch {
      rollback();
      toast.error("Swapping needs a connection. Try again in a moment.");
    }
  };

  const addExercise = (c: SwapCandidate, note?: string) => {
    setPicker(null);
    const exerciseId = c.id;
    const existing = items.find((i) => i.exercise.id === exerciseId);
    if (existing) {
      setSelectedKey(existing.key);
      toast(`${c.name} is already in this session`, { id: "exercise-added" });
      return;
    }
    setAdded([...added, exerciseId]);
    setSelectedKey(adhocItemKey(exerciseId));
    toast.success(`${c.name} added`, { id: "exercise-added" });
    if (c.blocked) appendNote(`${c.name}, added though blocked${note ? `: ${note}` : "."}`);
  };

  const createExercise = async (name: string, category: string): Promise<SwapCandidate | null> => {
    try {
      const res = await createExerciseAction(view.id, { name, category });
      if (!res.ok) {
        toast.error(res.error);
        return null;
      }
      setCreated((prev) => [...prev, res.data]);
      return res.data;
    } catch {
      toast.error("Creating an exercise needs a connection.");
      return null;
    }
  };

  /** Forget an added exercise and its unsaved extra sets, so adding it again starts fresh. */
  const dropAdded = (item: LiveItemView) => {
    setAdded(added.filter((id) => id !== item.exercise.id));
    const forget = <T,>(m: Record<string, T>) => {
      const next = { ...m };
      delete next[item.key];
      return next;
    };
    setSetCounts(forget);
    setOverlay(forget);
  };

  const removeAdded = (item: LiveItemView) => {
    dropAdded(item);
    setSelectedKey(null);
  };

  const saveNote = (text: string) => {
    const name = current?.exercise.name;
    appendNote(name ? `${name}: ${text}` : text);
  };

  const appendNote = (line: string) => {
    const next = notes.trim() ? `${notes.trim()}\n${line}` : line;
    const before = notes;
    setNoteOpen(false);
    void mutate({ kind: "saveNotes", sessionId: view.id, notes: next.slice(0, 2000) }, {
      apply: () => {
        setNotes(next);
        toast.success("Note added for your PT", { id: "note" });
      },
      rollback: () => setNotes(before),
    });
  };

  const discard = async () => {
    if (!window.confirm("Discard this session? Logged sets are deleted and the plan goes back to ready.")) return;
    try {
      const res = await discardSessionAction(view.id);
      if (!res.ok) return void toast.error(res.error);
      setRest(null);
      saveAdded(view.id, []);
      router.push("/today");
    } catch {
      toast.error("Discarding needs a connection.");
    }
  };

  const addRest = (sec: number) => {
    const now = Date.now();
    if (rest && rest.endAt > now) {
      setRest({ ...rest, endAt: rest.endAt + sec * 1000, totalSec: rest.totalSec + sec });
    } else {
      setRest({ endAt: now + sec * 1000, totalSec: sec, label: rest?.label ?? "Rest" });
    }
  };

  return (
    <div className={cn(kindClass(view.sessionType), "min-h-dvh flex flex-col pb-[calc(env(safe-area-inset-bottom)+40px)]")}>
      <div className="bg-k text-k-on">
      <header className="page-top px-4 grid grid-cols-[44px_1fr_auto] items-center gap-2">
        <Link href="/today" prefetch aria-label="Back to Today" className="btn-round on-k">
          <ChevronDownIcon size={20} strokeWidth={2.4} />
        </Link>
        <div className="flex flex-col items-center gap-0.5 min-w-0">
          <span className="text-[13px] font-semibold opacity-85 truncate max-w-full">{headerTitle}</span>
          <span className="flex items-center gap-[7px]">
            <span className="w-[7px] h-[7px] rounded-full bg-white animate-live-dot" aria-hidden />
            <span className="num text-[20px]" role="timer" aria-label="Session time">
              <Elapsed startedAt={view.startedAt} />
            </span>
          </span>
        </div>
        <Link href={`/session/${view.id}/finish`} prefetch className="btn-pill on-k">
          Finish
        </Link>
      </header>

      {pending > 0 && (
        <p role="status" className="m-0 mt-2 text-center text-[13px] font-semibold opacity-85">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 align-middle" />
          {pending} change{pending === 1 ? "" : "s"} saved on this phone, will sync
        </p>
      )}

      <div
        role="progressbar"
        aria-label={`Exercise ${Math.max(1, currentIdx + 1)} of ${items.length}`}
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={items.filter((i) => i.done).length}
        className="flex gap-1 px-5 pt-4"
      >
        {items.map((it) => {
          const p = it.done ? 1 : it.key === current?.key ? itemProgress(it) : 0;
          return (
            <span key={it.key} className="relative h-1.5 flex-1 rounded-full bg-white/25 overflow-hidden">
              <span
                className="absolute inset-0 bg-white origin-left transition-transform duration-500 ease-spring"
                style={{ transform: `scaleX(${p})` }}
              />
            </span>
          );
        })}
      </div>

      {view.progressionOnHold && (
        <p className="mx-5 mt-3 mb-0 flex gap-2 items-center text-[15px] font-semibold opacity-90">
          <WarnIcon size={16} className="shrink-0" />
          Progression on hold today: match last session&apos;s loads, no bumps.
        </p>
      )}
      </div>

      {current ? (
        <ExerciseCard
          item={current}
          position={currentIdx + 1}
          total={items.length}
          canRemoveSet={
            lastLoggedIndex(current) >= 0 || (!current.sets[current.sets.length - 1]?.planned && current.sets.length > 1)
          }
          next={nextItem ? { name: nextItem.exercise.name } : null}
          onSwap={current.planItemId ? () => setPicker({ swapKey: current.key }) : null}
          onRemoveExercise={canRemoveAdded(current, added) ? () => removeAdded(current) : null}
          onAddSet={() => addSet(current)}
          onRemoveSet={() => removeLastSet(current)}
          onNote={() => setNoteOpen(true)}
          onNext={() => nextItem && setSelectedKey(nextItem.key)}
          activeKg={activeKg}
        >
          <SetTable
            key={`${current.key}:${current.exercise.id}`}
            item={current}
            onLog={(index, input, kind) => onLog(current, index, input, kind)}
            onUndoLast={() => removeLastSet(current)}
            onActiveKg={setActiveKg}
          />
        </ExerciseCard>
      ) : (
        <section className="bg-k text-k-on px-6 pt-6 pb-10 flex flex-col gap-3 items-start">
          <h1 className="m-0 text-[40px] font-extrabold leading-[44px]">{items.length ? "All exercises done" : "No exercises in this session"}</h1>
          <p className="m-0 text-[17px] opacity-90">
            {items.length
              ? "Tap a completed exercise to edit it, or wrap up."
              : "This plan has no items. Discard it and start from Today."}
          </p>
          {items.length > 0 && (
            <Link href={`/session/${view.id}/finish`} prefetch className="btn-on-k mt-2">
              Finish workout
            </Link>
          )}
        </section>
      )}

      <UpNextList items={upNext} positions={positions} onSelect={setSelectedKey} />
      <CompletedList items={completed} onSelect={setSelectedKey} />

      <div className="mx-3 mt-[22px]">
        <button
          type="button"
          onClick={() => setPicker("add")}
          className="w-full h-12 rounded-[14px] border border-dashed border-line-strong text-[15px] font-semibold text-fg-2"
        >
          + Add exercise
        </button>
      </div>

      <div className="mt-8 mb-24 flex justify-center">
        <button
          type="button"
          onClick={() => void discard()}
          className="min-h-11 px-4 text-[15px] font-semibold text-muted"
        >
          Discard session
        </button>
      </div>

      <RestPill sessionId={view.id} rest={rest} nextLabel={restNext} onAdd={addRest} onSkip={skipRest} />

      {(picker === "add" || swapItem?.planItemId) && (
        <SwapSheet
          open
          onClose={() => setPicker(null)}
          replacing={
            swapItem
              ? { name: swapItem.exercise.name, exerciseId: swapItem.exercise.id, category: swapItem.exercise.category }
              : null
          }
          candidates={swap.candidates}
          constraintRegions={swap.constraintRegions}
          inSessionIds={items.map((i) => i.exercise.id)}
          onPick={swapItem ? (c, reason) => void doSwap(c, reason) : addExercise}
          onCreate={createExercise}
        />
      )}

      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} label="Note for your PT">
        {noteOpen && <NoteForm exercise={current?.exercise.name ?? null} onSave={saveNote} />}
      </Sheet>
    </div>
  );
}

function NoteForm({ exercise, onSave }: { exercise: string | null; onSave: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSave(text.trim());
      }}
    >
      <div className="flex flex-col px-1.5">
        <span className="text-[17px] font-cta">Note for your PT</span>
        {exercise && <span className="text-[13px] text-muted">{exercise}, added to the session notes</span>}
      </div>
      <textarea
        data-autofocus
        rows={3}
        value={text}
        maxLength={300}
        onChange={(e) => setText(e.target.value)}
        placeholder="Grip slipped on set 3…"
        className="w-full rounded-[18px] bg-surface text-fg text-[16px] leading-[1.45] p-3.5 resize-none outline-none focus:ring-[2.5px] focus:ring-inset focus:ring-accent placeholder:text-faint"
      />
      <button type="submit" className="btn-primary" disabled={!text.trim()}>
        Add note
      </button>
    </form>
  );
}
