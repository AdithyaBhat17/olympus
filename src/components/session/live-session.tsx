"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trueKg } from "@/domain/load";
import type { SetLogEntry } from "@/domain/types";
import type { LiveItemView, SessionView } from "@/server/sessions";
import {
  discardSessionAction,
  logSetAction,
  removeSetAction,
  swapExerciseAction,
} from "@/lib/liftlog-actions";
import { ChevronDownIcon, WarnIcon } from "./icons";
import { Elapsed, RestTimer, loadRest, saveRest, type RestState } from "./timers";
import { ExerciseCard } from "./exercise-card";
import { SetTable, type LogInput, type LogKind } from "./set-table";
import { CompletedList, UpNextList } from "./session-lists";
import { SwapSheet, type SwapCandidate } from "./swap-sheet";
import { useAction } from "./use-action";

/** Optimistic set edits per item key: index → entry (null = removed). */
type Overlay = Record<string, Record<number, SetLogEntry | null>>;

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
    return { ...base, logged };
  });
  const planned = sets.filter((s) => s.planned).length;
  const logged = sets.filter((s) => s.logged).length;
  return { ...it, sets, done: planned > 0 ? logged >= planned : logged > 0 };
}

export function LiveSession({ view, swap }: LiveSessionProps) {
  const router = useRouter();
  const { run, busy } = useAction();

  const [overlay, setOverlay] = useState<Overlay>({});
  const [setCounts, setSetCounts] = useState<Record<string, number>>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [swapKey, setSwapKey] = useState<string | null>(null);
  const [rest, setRestState] = useState<RestState | null>(null);

  // Rest timer survives reloads via localStorage (read after mount only).
  useEffect(() => {
    setRestState(loadRest(view.id));
  }, [view.id]);
  const setRest = useCallback(
    (next: RestState | null) => {
      setRestState(next);
      saveRest(view.id, next);
    },
    [view.id]
  );

  // Drop optimistic entries the server view now reflects.
  useEffect(() => {
    setOverlay((prev) => {
      const next: Overlay = {};
      for (const [key, entries] of Object.entries(prev)) {
        const serverItem = view.items.find((x) => x.key === key);
        for (const [k, v] of Object.entries(entries)) {
          const server = serverItem?.sets[Number(k)]?.logged ?? null;
          const reflected = v === null ? server === null : server?.doneAt != null && server.doneAt === v.doneAt;
          if (!reflected) (next[key] ??= {})[Number(k)] = v;
        }
      }
      return next;
    });
  }, [view]);

  const items = useMemo(
    () => view.items.map((it) => mergeItem(it, overlay[it.key], setCounts[it.key] ?? 0)),
    [view.items, overlay, setCounts]
  );

  const current =
    (selectedKey ? items.find((i) => i.key === selectedKey) : undefined) ??
    items.find((i) => !i.done) ??
    null;
  const currentIdx = current ? items.indexOf(current) : -1;
  const completed = items.filter((i) => i.done && i.key !== current?.key);
  const upNext = items.filter((i) => !i.done && i.key !== current?.key);
  const nextItem = current
    ? items.slice(currentIdx + 1).find((i) => !i.done) ?? upNext[0] ?? null
    : null;
  const doneCount = items.filter((i) => i.done).length;
  const swapItem = swapKey ? items.find((i) => i.key === swapKey) ?? null : null;

  const headerTitle =
    view.sessionType && !view.title.startsWith("Session ")
      ? `Session ${view.sessionType} · ${view.title}`
      : view.title;

  const putOverlay = (key: string, index: number, v: SetLogEntry | null | undefined) =>
    setOverlay((prev) => {
      const entries = { ...(prev[key] ?? {}) };
      if (v === undefined) delete entries[index];
      else entries[index] = v;
      return { ...prev, [key]: entries };
    });

  const onLog = async (item: LiveItemView, index: number, input: LogInput, kind: LogKind) => {
    const s = item.sets[index];
    const type = s?.logged?.type ?? s?.planned?.type ?? "working";
    const weight = input.platesKg != null ? trueKg(item.exercise, input.platesKg) : input.weight;
    const before = overlay[item.key] && index in overlay[item.key] ? overlay[item.key][index] : undefined;

    putOverlay(item.key, index, {
      reps: input.reps,
      weight,
      platesKg: input.platesKg,
      rpe: input.rpe,
      type,
      flags: s?.logged?.flags,
      doneAt: new Date().toISOString(),
    });
    if (kind === "new") {
      setSelectedKey(item.key);
      setRest({
        endAt: Date.now() + item.restSec * 1000,
        totalSec: item.restSec,
        label: item.exercise.isCompound ? "Rest · compound" : "Rest · accessory",
      });
    }

    const res = await run(() =>
      logSetAction(view.id, {
        exerciseId: item.exercise.id,
        planItemId: item.planItemId,
        setIndex: index,
        reps: input.reps,
        rpe: input.rpe,
        type,
        blockedOverride: item.blockedReason ? true : undefined,
        ...(input.platesKg != null ? { platesKg: input.platesKg } : { weight: input.weight }),
      })
    );
    if (!res.ok) {
      putOverlay(item.key, index, before);
      return null;
    }
    putOverlay(item.key, index, res.data.set);
    return res.data;
  };

  const addSet = (item: LiveItemView) => {
    setSetCounts((c) => ({ ...c, [item.key]: item.sets.length + 1 }));
    setSelectedKey(item.key);
  };

  const lastLoggedIndex = (item: LiveItemView) =>
    item.sets.reduce((acc, s) => (s.logged ? s.index : acc), -1);

  const removeLastSet = async (item: LiveItemView) => {
    const last = item.sets[item.sets.length - 1];
    if (last && !last.logged && !last.planned && item.sets.length > 1) {
      setSetCounts((c) => ({ ...c, [item.key]: item.sets.length - 1 }));
      return;
    }
    const idx = lastLoggedIndex(item);
    if (idx < 0) return;
    const before = overlay[item.key]?.[idx];
    putOverlay(item.key, idx, null);
    setSetCounts((c) => ({ ...c, [item.key]: Math.min(c[item.key] ?? 0, item.sets.length - 1) }));
    const res = await run(() =>
      removeSetAction(view.id, {
        exerciseId: item.exercise.id,
        planItemId: item.planItemId,
        setIndex: idx,
      })
    );
    if (!res.ok) putOverlay(item.key, idx, before);
  };

  const doSwap = async (exerciseId: string, overrideReason?: string) => {
    if (!swapItem?.planItemId) return;
    const res = await run(() =>
      swapExerciseAction(view.id, {
        planItemId: swapItem.planItemId!,
        exerciseId,
        overrideReason: overrideReason ?? null,
      })
    );
    if (res.ok) {
      setSwapKey(null);
      setSelectedKey(swapItem.key);
      toast.success(overrideReason ? "Swapped — flagged for your PT" : "Exercise swapped");
    }
  };

  const discard = async () => {
    if (!window.confirm("Discard this session? Logged sets are deleted and the plan goes back to ready.")) return;
    const res = await run(() => discardSessionAction(view.id), { refresh: false });
    if (res.ok) {
      setRest(null);
      router.push("/today");
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
    <div className="flex flex-col min-h-screen pb-10">
      <header className="sticky top-0 z-30 safe-top px-4 pb-3 flex items-center gap-2 border-b border-line bg-bg">
        <Link
          href="/today"
          aria-label="Back to Today"
          className="w-11 h-11 -ml-2 flex items-center justify-center text-fg shrink-0"
        >
          <ChevronDownIcon size={22} />
        </Link>
        <div className="grow flex flex-col min-w-0">
          <span className="font-semibold text-base truncate">{headerTitle}</span>
          <span className="font-display text-lg text-muted tabular-nums">
            <Elapsed startedAt={view.startedAt} /> · {doneCount} of {items.length} done
          </span>
        </div>
        <Link
          href={`/session/${view.id}/finish`}
          className="h-11 px-4 rounded-[10px] bg-surface-2 text-fg font-semibold flex items-center shrink-0"
        >
          Finish
        </Link>
      </header>

      <RestTimer rest={rest} onAdd={addRest} onSkip={() => setRest(null)} />

      {view.progressionOnHold && (
        <p className="mx-4 mt-3 flex gap-2 items-center text-[13px] text-muted">
          <WarnIcon size={16} className="text-danger-soft shrink-0" />
          Progression on hold — hit last session&apos;s loads, no bumps.
        </p>
      )}

      <CompletedList items={completed} onSelect={setSelectedKey} />

      {current ? (
        <ExerciseCard
          item={current}
          position={currentIdx + 1}
          total={items.length}
          disabled={busy}
          canRemoveSet={
            lastLoggedIndex(current) >= 0 ||
            (!current.sets[current.sets.length - 1]?.planned && current.sets.length > 1)
          }
          next={nextItem ? { name: nextItem.exercise.name } : null}
          onSwap={current.planItemId ? () => setSwapKey(current.key) : null}
          onAddSet={() => addSet(current)}
          onRemoveSet={() => void removeLastSet(current)}
          onNote={() => toast("Notes go on the Finish screen")}
          onNext={() => nextItem && setSelectedKey(nextItem.key)}
        >
          <SetTable
            key={`${current.key}:${current.exercise.id}`}
            item={current}
            disabled={busy}
            onLog={(index, input, kind) => onLog(current, index, input, kind)}
          />
        </ExerciseCard>
      ) : (
        <section className="mx-4 mt-4 card flex flex-col gap-3 items-start">
          <h1 className="font-display font-bold text-[32px] leading-none">
            {items.length ? "All exercises done" : "No exercises in this session"}
          </h1>
          <p className="text-sm text-muted">
            {items.length
              ? "Tap a completed exercise to edit it, or wrap up."
              : "This plan has no items. Discard it and start from Today."}
          </p>
          {items.length > 0 && (
            <Link href={`/session/${view.id}/finish`} className="btn-primary">
              Finish session
            </Link>
          )}
        </section>
      )}

      <UpNextList items={upNext} onSelect={setSelectedKey} />

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={() => void discard()}
          disabled={busy}
          className="min-h-11 px-4 text-sm text-faint hover:text-danger-soft underline underline-offset-4 disabled:opacity-50"
        >
          Discard session
        </button>
      </div>

      {swapItem?.planItemId && (
        <SwapSheet
          open
          onClose={() => setSwapKey(null)}
          replacing={{
            name: swapItem.exercise.name,
            exerciseId: swapItem.exercise.id,
            category: swapItem.exercise.category,
          }}
          candidates={swap.candidates}
          constraintRegions={swap.constraintRegions}
          inSessionIds={items.map((i) => i.exercise.id)}
          disabled={busy}
          onSwap={(id, reason) => void doSwap(id, reason)}
        />
      )}
    </div>
  );
}
