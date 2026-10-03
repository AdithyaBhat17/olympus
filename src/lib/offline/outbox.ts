"use client";

/**
 * Offline outbox for gym-floor writes. Every op carries absolute values (set
 * index + full set, water total, notes text), so replaying one after a
 * reconnect is idempotent.
 *
 *   send(op) → online and nothing queued: run the server action now.
 *              Network failure, offline, or ops already queued: persist to
 *              IndexedDB (FIFO, coalesced by key) and resolve as "queued".
 *   flush()  → replay the queue in order; stops at the first network failure.
 *
 * A domain rejection (validation, finished session…) resolves as "rejected"
 * so the caller can roll back its optimistic state.
 */

import {
  finishSessionAction,
  logSetAction,
  removeSetAction,
  resolveFlagAction,
  saveSessionNotesAction,
  sendToPTAction,
  upsertCheckInAction,
  type ActionResult,
} from "@/lib/liftlog-actions";
import { idbAll, idbDelete, idbPut } from "./idb";

type LogSetInput = Parameters<typeof logSetAction>[1];
type RemoveSetInput = Parameters<typeof removeSetAction>[1];
type CheckInInput = Parameters<typeof upsertCheckInAction>[0];

export type OutboxOp =
  | { kind: "logSet"; sessionId: string; input: LogSetInput }
  | { kind: "removeSet"; sessionId: string; input: RemoveSetInput }
  | { kind: "resolveFlag"; id: string }
  | { kind: "checkIn"; input: CheckInInput }
  | { kind: "saveNotes"; sessionId: string; notes: string | null }
  | { kind: "finish"; sessionId: string; notes: string | null }
  | { kind: "sendToPT"; sessionId: string; notes: string | null };

interface Entry {
  id: string;
  key: string;
  op: OutboxOp;
  createdAt: number;
  attempts: number;
}

export type SendResult<T> =
  | { status: "ok"; data: T }
  | { status: "queued" }
  | { status: "rejected"; error: string };

/** Ops with the same key supersede each other while queued. */
function keyOf(op: OutboxOp): string {
  switch (op.kind) {
    case "logSet":
    case "removeSet":
      return `set:${op.sessionId}:${op.input.exerciseId}:${op.input.planItemId ?? "-"}:${op.input.setIndex}`;
    case "resolveFlag":
      return `flag:${op.id}`;
    case "checkIn":
      return `checkin:${op.input.date ?? "today"}`;
    case "saveNotes":
      return `notes:${op.sessionId}`;
    case "finish":
    case "sendToPT":
      return `${op.kind}:${op.sessionId}`;
  }
}

function execute(op: OutboxOp): Promise<ActionResult<unknown>> {
  switch (op.kind) {
    case "logSet":
      return logSetAction(op.sessionId, op.input);
    case "removeSet":
      return removeSetAction(op.sessionId, op.input);
    case "resolveFlag":
      return resolveFlagAction(op.id);
    case "checkIn":
      return upsertCheckInAction(op.input);
    case "saveNotes":
      return saveSessionNotesAction(op.sessionId, op.notes);
    case "finish":
      return finishSessionAction(op.sessionId, op.notes);
    case "sendToPT":
      return sendToPTAction(op.sessionId, op.notes);
  }
}

// --- queue state ------------------------------------------------------------

let pending = 0;
let loaded: Promise<void> | null = null;
let flushing: Promise<number> | null = null;
const listeners = new Set<(n: number) => void>();
const syncedListeners = new Set<() => void>();

function setPending(n: number) {
  pending = n;
  listeners.forEach((l) => l(n));
}

async function refreshCount() {
  setPending((await idbAll<Entry>()).length);
}

function load() {
  loaded ??= refreshCount().catch(() => {});
  return loaded;
}

export function subscribePending(fn: (n: number) => void): () => void {
  listeners.add(fn);
  void load().then(() => fn(pending));
  return () => {
    listeners.delete(fn);
  };
}

/** Fires after a flush pushed at least one op to the server. */
export function onSynced(fn: () => void): () => void {
  syncedListeners.add(fn);
  return () => {
    syncedListeners.delete(fn);
  };
}

export function pendingCount() {
  return pending;
}

async function enqueue(op: OutboxOp) {
  const key = keyOf(op);
  let merged = op;
  for (const e of await idbAll<Entry>()) {
    if (e.key !== key) continue;
    // Merge check-in patches so a queued water +250 keeps a queued sleep edit.
    if (e.op.kind === "checkIn" && op.kind === "checkIn") {
      merged = { kind: "checkIn", input: { ...e.op.input, ...op.input } };
    }
    await idbDelete(e.id);
  }
  await idbPut<Entry>({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    key,
    op: merged,
    createdAt: Date.now(),
    attempts: 0,
  });
  await refreshCount();
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export async function send<T>(op: OutboxOp): Promise<SendResult<T>> {
  await load();
  // Never jump the queue: a later op must not land before an earlier one.
  if (isOffline() || pending > 0 || flushing) {
    await enqueue(op);
    void flush();
    return { status: "queued" };
  }
  try {
    const res = (await execute(op)) as ActionResult<T>;
    return res.ok ? { status: "ok", data: res.data } : { status: "rejected", error: res.error };
  } catch {
    // fetch failed: no signal. Keep it and retry later.
    await enqueue(op);
    return { status: "queued" };
  }
}

/** Replay queued ops in order. Resolves to the number synced. */
export function flush(): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let synced = 0;
    const rejected: string[] = [];
    try {
      if (isOffline()) return 0;
      const entries = (await idbAll<Entry>()).sort((a, b) => a.createdAt - b.createdAt);
      for (const e of entries) {
        let res: ActionResult<unknown>;
        try {
          res = await execute(e.op);
        } catch {
          await idbPut({ ...e, attempts: e.attempts + 1 });
          break; // still offline — try again later
        }
        await idbDelete(e.id);
        if (res.ok) synced++;
        else rejected.push(res.error);
      }
    } finally {
      await refreshCount().catch(() => {});
      flushing = null;
    }
    if (rejected.length) {
      const { toast } = await import("sonner");
      toast.error(`Couldn't sync ${rejected.length} change${rejected.length === 1 ? "" : "s"}: ${rejected[0]}`);
    }
    if (synced || rejected.length) syncedListeners.forEach((l) => l());
    return synced;
  })();
  return flushing;
}
