"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateWorkingWeightAction } from "@/lib/liftlog-actions";
import { Sheet } from "@/components/session/sheet";

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
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          setGuard(null);
          setError(null);
        }}
        className={className ?? "btn-pill"}
      >
        Edit working weight
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} label={`Set working weight for ${exerciseName}`}>
        <form
          id={`${id}-panel`}
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col px-1.5">
            <span className="text-[17px] font-cta">Working weight</span>
            <span className="text-[13px] text-muted">{exerciseName}, goes in the audit log for your PT</span>
          </div>
          <div className="grid grid-cols-[7.5rem_1fr] gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-kg`} className="text-xs text-muted px-1">
                Kg
              </label>
              <input
                id={`${id}-kg`}
                data-autofocus
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={kg}
                onChange={(e) => {
                  setKg(e.target.value);
                  setGuard(null);
                }}
                className="input-base num text-[24px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-reason`} className="text-xs text-muted px-1">
                Reason
              </label>
              <input
                id={`${id}-reason`}
                type="text"
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="New machine, recalibrated…"
                className="input-base"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="m-0 px-1 text-sm text-danger-text">
              {error}
            </p>
          )}

          {guard ? (
            <div role="alert" className="rounded-[16px] bg-accent-bg ring-1 ring-inset ring-accent-line p-3 flex flex-col gap-3">
              <p className="m-0 text-sm leading-[1.45] text-fg-2">{guard}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-ghost" onClick={() => setGuard(null)}>
                  Change it
                </button>
                <button type="button" disabled={pending} onClick={() => submit(true)} className="btn-ghost bg-accent text-accent-ink font-semibold">
                  {pending ? "Saving…" : "Force with reason"}
                </button>
              </div>
            </div>
          ) : (
            <button type="submit" disabled={pending} className="btn-primary">
              {pending ? "Saving…" : "Save"}
            </button>
          )}
        </form>
      </Sheet>
    </>
  );
}
