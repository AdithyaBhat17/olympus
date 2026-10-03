"use client";

import { toast } from "sonner";
import { send, type OutboxOp, type SendResult } from "./outbox";

/**
 * Optimistic mutation: `apply` runs synchronously before any network, then
 * the op goes through the outbox. A server rejection calls `rollback` and
 * toasts (never a modal); no signal keeps the optimistic state and queues.
 */
export async function mutate<T>(
  op: OutboxOp,
  handlers: {
    apply?: () => void;
    rollback?: () => void;
    onOk?: (data: T) => void;
  } = {}
): Promise<SendResult<T>> {
  handlers.apply?.();
  const res = await send<T>(op);
  if (res.status === "rejected") {
    handlers.rollback?.();
    toast.error(res.error);
  } else if (res.status === "ok") {
    handlers.onOk?.(res.data);
  } else {
    toast("Saved on this phone — syncs when you're back online", { id: "offline-queued" });
  }
  return res;
}
