"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TodaySlots, SlotItem } from "@/server/supplements";
import { clearDoseAction, setDoseAction, takeSlotAction } from "@/app/(app)/supplements/actions";

const STATUS: Record<SlotItem["status"], { label: string; cls: string }> = {
  pending: { label: "", cls: "bg-surface-2 text-fg-2" },
  taken: { label: "✓", cls: "bg-accent-bg text-fg" },
  half: { label: "½", cls: "bg-accent-bg text-fg" },
  skipped: { label: "skipped", cls: "bg-surface-2 text-muted line-through" },
};

function showNudges(nudges: string[]) {
  for (const n of nudges) toast.info(n, { duration: 10_000 });
}

/**
 * Today's supplements by slot. One tap logs a whole slot; tap an item for
 * half / skip / late / undo. No streaks: a missed day is just a missed day.
 */
export function SlotCard({ data, compact = false }: { data: TodaySlots; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  if (!data.slots.length) {
    return compact ? null : (
      <p className="mx-5 text-[14px] text-muted">Nothing scheduled today. Add your stack below.</p>
    );
  }
  const act = (fn: () => Promise<{ ok: true; data: { nudges?: string[]; logged?: number } | undefined } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      if (r.data?.nudges) showNudges(r.data.nudges);
      setOpen(null);
      router.refresh();
    });

  return (
    <section aria-label="Supplements today" className="card mx-3 mt-3 px-4 py-3 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 text-[15px] font-semibold">Supplements</h2>
        {compact && (
          <Link href="/supplements" className="text-[13px] text-fg-2">
            Stack, labs ›
          </Link>
        )}
      </div>
      {data.lowStock.length > 0 && (
        <p className="m-0 text-[13px] text-danger-text">
          Running low: {data.lowStock.map((s) => `${s.name} (${s.daysLeft} d)`).join(", ")}
        </p>
      )}
      {data.slots.map(({ slot, label, items }) => {
        const pendingCount = items.filter((i) => i.status === "pending").length;
        return (
          <div key={slot} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-muted">{label}</span>
              {pendingCount > 0 ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => takeSlotAction(slot, data.date))}
                  className="h-9 px-3 rounded-full bg-accent text-accent-ink text-[13px] font-semibold disabled:opacity-50"
                >
                  {pendingCount === items.length ? "Taken" : `Take ${pendingCount} left`}
                </button>
              ) : (
                <span className="text-[12px] text-muted">done</span>
              )}
            </div>
            <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
              {items.map((i) => {
                const s = STATUS[i.status];
                const key = i.supplement.id;
                return (
                  <li key={key} className="relative">
                    <button
                      type="button"
                      onClick={() => setOpen(open === key ? null : key)}
                      aria-expanded={open === key}
                      className={cn("h-8 px-2.5 rounded-full text-[13px]", s.cls)}
                    >
                      {i.supplement.name}
                      {s.label && i.status !== "skipped" ? ` ${s.label}` : ""}
                      {i.late ? " · late" : ""}
                    </button>
                  </li>
                );
              })}
            </ul>
            {items.some((i) => i.supplement.id === open) &&
              (() => {
                const i = items.find((x) => x.supplement.id === open)!;
                const id = i.supplement.id;
                const btn = "h-9 px-3 rounded-[10px] bg-surface-2 text-[13px]";
                return (
                  <div className="flex flex-wrap gap-1.5 p-2 rounded-[12px] bg-surface-3/60">
                    <button type="button" className={btn} disabled={pending} onClick={() => act(() => setDoseAction(id, "taken", { date: data.date }))}>
                      Taken
                    </button>
                    {i.supplement.foodId && (
                      <button type="button" className={btn} disabled={pending} onClick={() => act(() => setDoseAction(id, "taken", { date: data.date, multiplier: 2 }))}>
                        ×2
                      </button>
                    )}
                    <button type="button" className={btn} disabled={pending} onClick={() => act(() => setDoseAction(id, "half", { date: data.date }))}>
                      Half
                    </button>
                    <button type="button" className={btn} disabled={pending} onClick={() => act(() => setDoseAction(id, "taken", { date: data.date, late: true }))}>
                      Late
                    </button>
                    <button type="button" className={btn} disabled={pending} onClick={() => act(() => setDoseAction(id, "skipped", { date: data.date }))}>
                      Skip
                    </button>
                    {i.status !== "pending" && (
                      <button
                        type="button"
                        className={cn(btn, "text-danger-soft")}
                        disabled={pending}
                        onClick={() =>
                          act(async () => {
                            const r = await clearDoseAction(id, data.date);
                            return r.ok ? { ok: true as const, data: {} } : r;
                          })
                        }
                      >
                        Undo
                      </button>
                    )}
                  </div>
                );
              })()}
          </div>
        );
      })}
    </section>
  );
}
