"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Sheet } from "@/components/session/sheet";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { hapticTick } from "@/lib/haptics";
import type { TodaySlots, SlotItem } from "@/server/supplements";
import { SLOTS } from "@/domain/supplements";

const SLOT_TIME: Record<string, string> = Object.fromEntries(SLOTS.map((s) => [s.slot, s.time]));
import { clearDoseAction, setDoseAction, takeSlotAction } from "@/app/(app)/supplements/actions";

type ActionResult = { ok: true; data: { nudges?: string[]; logged?: number } | undefined } | { ok: false; error: string };

function showNudges(nudges: string[]) {
  for (const n of nudges) toast.info(n, { duration: 10_000 });
}

const done = (i: SlotItem) => i.status !== "pending";

function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** The slot's check: an empty ring, a ring filling as items are taken, then solid. */
function SlotCheck({ items, onTake, disabled, label }: { items: SlotItem[]; onTake: () => void; disabled: boolean; label: string }) {
  const n = items.filter(done).length;
  const all = n === items.length;
  const pct = n / items.length;
  const C = 2 * Math.PI * 19;
  return (
    <button
      type="button"
      onClick={onTake}
      disabled={disabled || all}
      aria-label={all ? `${label}: done` : `Mark ${label} taken`}
      className={cn(
        "relative w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-colors",
        all ? "bg-accent text-accent-ink" : "bg-bg text-accent"
      )}
    >
      {!all && (
        <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx="22" cy="22" r="19" fill="none" strokeWidth="2.5" className="stroke-line-strong" />
          {pct > 0 && <circle cx="22" cy="22" r="19" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${C * pct} ${C}`} className="stroke-accent" />}
        </svg>
      )}
      {all ? <CheckIcon /> : pct > 0 ? <span className="num text-[13px] text-fg-2">{n}/{items.length}</span> : null}
    </button>
  );
}

function itemNote(i: SlotItem) {
  if (i.status === "skipped") return "skipped";
  if (i.status === "half") return "half";
  if (i.status === "taken") return i.late ? "late" : null;
  return null;
}

function SlotDetail({
  slot,
  date,
  pending,
  act,
}: {
  slot: TodaySlots["slots"][number];
  date: string;
  pending: boolean;
  act: (fn: () => Promise<ActionResult>) => void;
}) {
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-2">
      {slot.items.map((i) => {
        const id = i.supplement.id;
        const chip = "h-10 px-4 rounded-full text-[15px] font-bold";
        const set = (status: "taken" | "half" | "skipped", extra: { late?: boolean; multiplier?: number } = {}) => () => {
          hapticTick();
          act(() => setDoseAction(id, status, { date, ...extra }));
        };
        return (
          <li key={id} className="rounded-[22px] bg-surface p-4 flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[17px] font-bold truncate">{i.supplement.name}</span>
              <span className="text-[13px] text-muted shrink-0">{i.supplement.servingDesc}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {i.status === "pending" ? (
                <>
                  <button type="button" disabled={pending} onClick={set("taken")} className={cn(chip, "bg-accent text-accent-ink")}>
                    Taken
                  </button>
                  {i.supplement.foodId && (
                    <button type="button" disabled={pending} onClick={set("taken", { multiplier: 2 })} className={cn(chip, "bg-bg")}>
                      ×2
                    </button>
                  )}
                  <button type="button" disabled={pending} onClick={set("half")} className={cn(chip, "bg-bg")}>
                    Half
                  </button>
                  <button type="button" disabled={pending} onClick={set("taken", { late: true })} className={cn(chip, "bg-bg")}>
                    Late
                  </button>
                  <button type="button" disabled={pending} onClick={set("skipped")} className={cn(chip, "bg-bg text-muted")}>
                    Skip
                  </button>
                </>
              ) : (
                <>
                  <span className={cn(chip, "inline-flex items-center gap-1.5 bg-accent-bg text-fg")}>
                    {i.status !== "skipped" && <CheckIcon size={15} />}
                    {i.status === "taken" ? (i.late ? "Taken late" : "Taken") : i.status === "half" ? "Half dose" : "Skipped"}
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      act(async () => {
                        const r = await clearDoseAction(id, date);
                        return r.ok ? { ok: true as const, data: {} } : r;
                      })
                    }
                    className={cn(chip, "bg-bg text-fg-2")}
                  >
                    Undo
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Today's supplements as a row of slot tiles. The ring takes the whole slot
 * in one tap; the tile opens per-item controls (half, late, skip, undo).
 * The row starts at the next slot still due. No streaks.
 */
export function SlotCard({ data, compact = false }: { data: TodaySlots; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const rowRef = useRef<HTMLUListElement>(null);
  const firstDue = data.slots.findIndex((s) => s.items.some((i) => !done(i)));

  useEffect(() => {
    const row = rowRef.current;
    const tile = firstDue > 0 ? (row?.children[firstDue] as HTMLElement | undefined) : undefined;
    if (row && tile) row.scrollLeft = tile.offsetLeft - 16;
    // Only on mount: don't yank the row while someone is ticking things off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data.slots.length) {
    return compact ? null : <p className="mx-5 text-[15px] text-muted">Nothing scheduled today. Add your stack below.</p>;
  }

  const act = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      if (r.data?.nudges) showNudges(r.data.nudges);
      router.refresh();
    });

  const total = data.slots.reduce((s, x) => s + x.items.length, 0);
  const taken = data.slots.reduce((s, x) => s + x.items.filter(done).length, 0);
  const openSlot = data.slots.find((s) => s.slot === open) ?? null;

  return (
    <section aria-labelledby="stack-h" className="arrive arrive-2">
      <header className="flex items-center justify-between pl-5 pr-3">
        <h2 id="stack-h" className="m-0 text-[17px] font-extrabold">
          {compact ? "Supplements" : "Today"} <span className="text-[13px] font-semibold text-muted tabular-nums ml-1">{taken} of {total}</span>
        </h2>
        {compact && (
          <Link href="/supplements" className="h-10 px-2 rounded-full flex items-center gap-0.5 text-[15px] font-semibold text-fg-2">
            Stack
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        )}
      </header>

      {data.lowStock.length > 0 && (
        <p className="m-0 mx-5 mb-1 text-[13px] font-semibold text-danger-text">
          Running low: {data.lowStock.map((s) => `${s.name}, ${s.daysLeft} days`).join(" · ")}
        </p>
      )}

      <ul ref={rowRef} className="scroller m-0 p-0 list-none flex gap-2 overflow-x-auto px-4 pt-1 pb-1 snap-x scroll-px-4">
        {data.slots.map((s) => {
          const allDone = s.items.every(done);
          return (
            <li key={s.slot} className={cn("snap-start shrink-0 w-[148px] rounded-[24px] p-3 flex flex-col gap-2.5 transition-colors", allDone ? "bg-accent-bg" : "bg-surface")}>
              <div className="flex items-center justify-between">
                <SlotCheck
                  items={s.items}
                  label={s.label}
                  disabled={pending}
                  onTake={() => {
                    hapticTick();
                    act(() => takeSlotAction(s.slot, data.date));
                  }}
                />
                {SLOT_TIME[s.slot] && s.slot !== "any" && <span className="text-[13px] font-semibold text-faint tabular-nums pr-1">{SLOT_TIME[s.slot]}</span>}
              </div>
              <button type="button" onClick={() => setOpen(s.slot)} className="press-soft text-left flex flex-col gap-0.5 min-h-[58px]">
                <span className={cn("text-[15px] font-extrabold", allDone && "text-fg-2")}>{s.label}</span>
                <span className="text-[13px] leading-snug text-muted line-clamp-2">
                  {s.items.map((i, n) => (
                    <span key={i.supplement.id} className={cn(i.status === "skipped" && "line-through")}>
                      {n > 0 && ", "}
                      {i.supplement.name}
                      {itemNote(i) && <span className="text-faint"> ({itemNote(i)})</span>}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Sheet open={openSlot != null} onClose={() => setOpen(null)} label={openSlot?.label ?? "Supplements"}>
        {openSlot && (
          <div className="px-4 pb-6 safe-bottom flex flex-col gap-4">
            <div className="flex items-center justify-between px-1 pt-1">
              <h3 className="m-0 text-[22px] font-extrabold">{openSlot.label}</h3>
              <SlotCheck
                items={openSlot.items}
                label={openSlot.label}
                disabled={pending}
                onTake={() => {
                  hapticTick();
                  act(() => takeSlotAction(openSlot.slot, data.date));
                }}
              />
            </div>
            <SlotDetail slot={openSlot} date={data.date} pending={pending} act={act} />
          </div>
        )}
      </Sheet>
    </section>
  );
}
