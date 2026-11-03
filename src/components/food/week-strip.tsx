import Link from "next/link";
import { cn } from "@/lib/utils";
import type { WeekDay } from "@/server/food/logs";

const R = 15;
const C = 2 * Math.PI * R;

function dayParts(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    initial: d.toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" }),
    day: d.getUTCDate(),
    label: d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
  };
}

/**
 * Seven days, each a ring filled by protein against the target, so the
 * week's consistency reads at a glance and any day is one tap away.
 */
export function WeekStrip({
  days,
  selected,
  today,
  target,
}: {
  days: WeekDay[];
  selected: string;
  today: string;
  target: number | null;
}) {
  return (
    <nav aria-label="Days" className="arrive grid grid-cols-7 gap-1 px-3 mt-4">
      {days.map((d) => {
        const { initial, day, label } = dayParts(d.date);
        const on = d.date === selected;
        const pct = target ? Math.min(1, d.protein / target) : d.logged ? 1 : 0;
        const hit = target != null && d.protein >= target;
        const future = d.date > today;
        const body = (
          <>
            <span className={cn("text-[12px] font-bold", on ? "text-bg/70" : "text-muted")}>{initial}</span>
            <span className="relative w-[38px] h-[38px] flex items-center justify-center">
              <svg viewBox="0 0 38 38" className="absolute inset-0 -rotate-90" aria-hidden="true">
                <circle cx="19" cy="19" r={R} fill="none" strokeWidth="3.5" className={on ? "stroke-bg/20" : "stroke-surface-3"} />
                {pct > 0 && (
                  <circle
                    cx="19"
                    cy="19"
                    r={R}
                    fill="none"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeDasharray={`${C * pct} ${C}`}
                    className={on ? "stroke-bg" : "stroke-accent"}
                  />
                )}
              </svg>
              <span className={cn("num text-[15px]", on ? "text-bg" : future ? "text-faint" : "text-fg")}>{day}</span>
            </span>
            <span
              aria-hidden="true"
              className={cn("w-1 h-1 rounded-full", d.date === today ? (on ? "bg-bg" : "bg-accent") : "bg-transparent")}
            />
          </>
        );
        const cls = cn("flex flex-col items-center gap-1 pt-2 pb-1.5 rounded-full", on && "bg-fg");
        const a11y = `${label}${d.logged ? `, ${d.protein} g protein${hit ? ", target reached" : ""}` : ", nothing logged"}`;
        return future ? (
          <span key={d.date} className={cn(cls, "opacity-60")} aria-label={label}>
            {body}
          </span>
        ) : (
          <Link
            key={d.date}
            href={d.date === today ? "/food" : `/food?d=${d.date}`}
            aria-label={a11y}
            aria-current={on ? "date" : undefined}
            className={cls}
            scroll={false}
          >
            {body}
          </Link>
        );
      })}
    </nav>
  );
}
