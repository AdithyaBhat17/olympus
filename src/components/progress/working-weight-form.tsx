"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateWorkingWeightAction } from "@/lib/liftlog-actions";
import { cn } from "@/lib/utils";

/**
 * "Set working weight": an audited override. Jumps of more than two
 * increments come back as a guard message with a "Force with reason" retry.
 */
export default function WorkingWeightForm({
  exerciseId,
  exerciseName,
  currentKg,
  className,
}: {
  exerciseId: string;
  exerciseName: string;
  currentKg: number | null;
  className?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [kg, setKg] = useState(currentKg != null ? String(currentKg) : "");
  const [reason, setReason] = useState("");
  const [guard, setGuard] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(force: boolean) {
    const value = parseFloat(kg.replace(",", "."));
    if (!Number.isFinite(value) || value < 0 || value > 1000) {
      setError("Enter a weight between 0 and 1000 kg.");
      return;
    }
    if (!reason.trim()) {
      setError(force ? "Forcing a jump needs a reason." : "Add a short reason — it goes in the audit log.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateWorkingWeightAction({
        exerciseId,
        kg: value,
        reason: reason.trim(),
        force,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (!res.data.ok) {
        setGuard(res.data.message);
        return;
      }
      toast.success(res.data.message);
      setGuard(null);
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => {
          setOpen((o) => !o);
          setGuard(null);
          setError(null);
        }}
        className={cn("btn-secondary bg-transparent", className)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
        Set working weight
      </button>

      {open && (
        <form
          id={`${id}-panel`}
          aria-label={`Set working weight for ${exerciseName}`}
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
          className="col-span-2 card flex flex-col gap-3 animate-fade-in"
        >
          <div className="grid grid-cols-[7.5rem_1fr] gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-kg`} className="text-xs text-muted">
                Kg
              </label>
              <input
                id={`${id}-kg`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={kg}
                onChange={(e) => {
                  setKg(e.target.value);
                  setGuard(null);
                }}
                className="input-base font-display text-[22px] font-semibold py-2 h-12"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-reason`} className="text-xs text-muted">
                Reason
              </label>
              <input
                id={`${id}-reason`}
                type="text"
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="New machine, recalibrated…"
                className="input-base py-2 h-12 text-[15px]"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}

          {guard ? (
            <div role="alert" className="rounded-xl border border-accent-line bg-accent-bg p-3 flex flex-col gap-3">
              <p className="text-sm leading-[1.45] text-fg-2">{guard}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-ghost" onClick={() => setGuard(null)}>
                  Change it
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => submit(true)}
                  className="h-11 rounded-[10px] bg-accent text-accent-ink font-semibold text-sm disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Force with reason"}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="h-11 rounded-[10px] bg-accent text-accent-ink font-semibold text-sm disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </form>
      )}
    </>
  );
}
