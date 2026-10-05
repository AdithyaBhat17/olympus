"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setExerciseBlockAction } from "@/lib/liftlog-actions";
import { Sheet } from "@/components/session/sheet";

/**
 * Take an exercise off the table for this athlete only (an injury, a machine
 * their gym doesn't have). Claude won't programme it; the library shows why.
 */
export default function BlockToggle({
  exerciseId,
  name,
  blocked,
  reason: currentReason,
}: {
  exerciseId: string;
  name: string;
  blocked: boolean;
  reason: string | null;
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function save(next: string | null) {
    startTransition(async () => {
      const res = await setExerciseBlockAction(exerciseId, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(next == null ? `${name} is back in your library` : `${name} blocked`);
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  if (blocked) {
    return (
      <section className="mx-4 mt-6 p-4 rounded-[26px] bg-surface flex items-center gap-3">
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="font-semibold">Blocked for you</span>
          {currentReason && <span className="text-[13px] text-danger-text">{currentReason}</span>}
        </span>
        <button type="button" disabled={pending} onClick={() => save(null)} className="btn-pill disabled:opacity-50">
          {pending ? "Unblocking…" : "Unblock"}
        </button>
      </section>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="mx-4 mt-6 min-h-11 px-2 self-start text-sm text-danger-soft"
      >
        Block this exercise for me
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} label={`Block ${name}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(reason);
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col px-1.5">
            <span className="text-[17px] font-cta">Block {name}</span>
            <span className="text-[13px] text-muted">Only for you. Your PT will use a substitute instead.</span>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-reason`} className="text-xs text-muted px-1">
              Why (optional)
            </label>
            <input
              id={`${id}-reason`}
              data-autofocus
              type="text"
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Sore wrist, gym doesn't have it…"
              className="input-base"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-11 rounded-[14px] bg-accent text-accent-ink font-semibold text-sm disabled:opacity-50"
            >
              {pending ? "Blocking…" : "Block"}
            </button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
