import Link from "next/link";
import { SLOTS } from "@/domain/supplements";
import type { TodaySlots } from "@/server/supplements";

const TIME: Record<string, string> = Object.fromEntries(SLOTS.map((s) => [s.slot, s.time]));

/** Supplements on the food page: one line that opens their own screen. */
export function SupplementsLine({ data }: { data: TodaySlots }) {
  const items = data.slots.flatMap((s) => s.items);
  if (!items.length) return null;
  const done = items.filter((i) => i.status !== "pending").length;
  const next = data.slots.find((s) => s.items.some((i) => i.status === "pending"));
  const all = done === items.length;
  return (
    <Link href="/supplements" className="press-soft mx-4 mt-4 flex items-center gap-3 rounded-[20px] bg-surface px-4 h-14">
      <span aria-hidden="true" className={all ? "size-2.5 rounded-full bg-accent" : "size-2.5 rounded-full bg-line-strong"} />
      <span className="flex-1 text-[16px] font-semibold">Supplements</span>
      <span className="text-[13px] text-muted tabular-nums">
        {all ? "All taken" : `${done} of ${items.length} taken${next ? ` · next ${TIME[next.slot] ?? ""}` : ""}`}
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-faint">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  );
}
