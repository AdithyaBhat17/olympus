"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn, kindClass } from "@/lib/utils";
import { PlateStack } from "@/components/ui/plate-stack";
import { hapticTick } from "@/lib/haptics";
import { clock } from "@/components/session/format";

export interface NextSessionItem {
  key: string;
  name: string;
  /** "47", "85", "21.1" — Archivo numerals. */
  load: string | null;
  /** "cw", "/side", "min" */
  unit: string | null;
  /** "↑5" when the open load is heavier than the last top set. */
  up: string | null;
  straps: boolean;
}

export interface NextSessionData {
  sessions: Array<{ type: string; sub: string; lastDone: string | null }>;
  /** The PT's plan type, else the next one in the rotation. */
  plannedType: string;
  lastType: string | null;
  hasPtPlan: boolean;
  planId: string | null;
  /** "16:40" when the plan was pushed by Claude. */
  fromPtAt: string | null;
  /** "Sat 3 Oct" when the plan isn't for today. */
  dayLabel: string | null;
  warnings: string[];
  items: NextSessionItem[];
  more: string[];
  live: { href: string; startedAt: string | null; type: string | null } | null;
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
    </svg>
  );
}

function LiveCta({ href, startedAt, opening }: { href: string; startedAt: number | null; opening?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (startedAt == null) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [startedAt]);
  const elapsed = startedAt != null && now != null ? clock((now - startedAt) / 1000).replace(/^0(\d)/, "$1") : null;
  return (
    <Link
      href={href}
      // /session/start creates a session on render; prefetching it races the
      // tap's navigation and leaves a second live session behind.
      prefetch={!opening}
      className="btn-on-k w-full"
    >
      <span className="w-2.5 h-2.5 rounded-full bg-k animate-live-dot" />
      {opening ? "Opening your session" : `Back to it${elapsed ? `, ${elapsed} in` : ""}`}
    </Link>
  );
}

export function NextSessionCard({ data }: { data: NextSessionData }) {
  const router = useRouter();
  const [pick, setPick] = useState(data.live?.type ?? data.plannedType);
  // Optimistic "Live" the instant Start is tapped; navigation is already underway.
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const onPlan = pick === data.plannedType;
  const sel = data.sessions.find((s) => s.type === pick) ?? data.sessions[0];
  const showItems = onPlan && data.items.length > 0;
  const startHref =
    onPlan && data.planId
      ? `/session/start?plan=${data.planId}`
      : `/session/start?type=${encodeURIComponent(pick)}`;

  // Warm the session route (layout + skeleton) before the tap.
  useEffect(() => {
    if (data.live) router.prefetch(data.live.href);
  }, [data.live, router]);

  const start = () => {
    hapticTick();
    setStartedAt(Date.now());
    router.push(startHref);
  };

  return (
    <section
      aria-labelledby="next-h"
      className={cn(
        kindClass(pick),
        "arrive arrive-1 relative overflow-hidden mx-4 mt-5 p-6 rounded-[36px] bg-k text-k-on flex flex-col gap-[18px] transition-colors duration-500"
      )}
    >
      <PlateStack className="-right-14 top-24 opacity-90" size={200} />

      <div className="relative flex justify-between items-center gap-3">
        {onPlan ? (
          data.fromPtAt ? (
            <span className="on-k inline-flex items-center gap-2 h-8 pl-2.5 pr-3 rounded-full text-[13px] font-bold">
              <span className="w-2 h-2 rounded-full bg-white animate-live-dot" />
              From your PT, {data.fromPtAt}
              {data.dayLabel && <span className="opacity-70">, {data.dayLabel}</span>}
            </span>
          ) : (
            <span className="text-[17px] font-semibold opacity-90">{data.live ? "In progress" : "Up next"}</span>
          )
        ) : (
          <button
            type="button"
            onClick={() => setPick(data.plannedType)}
            className="on-k inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-bold"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
            </svg>
            {data.hasPtPlan ? "Back to PT plan" : `Back to ${data.plannedType}`}
          </button>
        )}

        <div className="flex flex-col items-end gap-1">
          <span id="rot-label" className="sr-only">
            Rotation
          </span>
          <div role="radiogroup" aria-labelledby="rot-label" className="flex items-center gap-[3px]">
            {data.sessions.map(({ type }) => {
              const on = type === pick;
              const isLast = type === data.lastType;
              const isPlan = type === data.plannedType;
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!!data.live && !on}
                  aria-label={`Session ${type}${isPlan ? data.hasPtPlan ? ", planned by your PT" : ", next up" : ""}${isLast ? ", done last" : ""}`}
                  onClick={() => setPick(type)}
                  className={cn(
                    "relative w-11 h-11 rounded-full num text-[18px] flex items-center justify-center disabled:opacity-40 transition-colors",
                    on ? "bg-white text-k-text" : "on-k",
                    !on && isLast && "opacity-70",
                    !on && isPlan && "ring-2 ring-inset ring-white/70"
                  )}
                >
                  {type}
                  {isLast && (
                    <span
                      aria-hidden
                      className={cn("absolute bottom-[5px] w-1 h-1 rounded-full", on ? "bg-k" : "bg-white")}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="relative flex flex-col gap-1.5">
        <h2 id="next-h" key={pick} className="m-0 text-[52px] font-extrabold leading-[54px] tracking-[-0.5px] animate-slide-up">
          Session {pick}
        </h2>
        <p className="m-0 max-w-[230px] text-[17px] leading-[22px] opacity-90">{sel.sub}</p>
      </div>

      {!onPlan && (
        <p key={`note-${pick}`} className="relative m-0 px-4 py-3 rounded-3xl bg-white/15 text-[15px] leading-5 animate-slide-up">
          {data.hasPtPlan ? (
            <>
              Your PT planned <b className="font-extrabold">{data.plannedType}</b> for today.{" "}
            </>
          ) : (
            <>
              <b className="font-extrabold">{data.plannedType}</b> is next in the rotation.{" "}
            </>
          )}
          {sel.lastDone
            ? `Starting ${pick} repeats your last Session ${pick} (${sel.lastDone}), and your PT sees the swap.`
            : `There's no Session ${pick} to repeat yet.`}
        </p>
      )}

      {onPlan && data.warnings.length > 0 && (
        <details className="relative group -mt-1 rounded-3xl bg-white/15 px-4">
          <summary className="min-h-11 flex items-center gap-2 text-[15px] font-semibold cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform group-open:rotate-90">
              <path d="M9 6l6 6-6 6" />
            </svg>
            {data.warnings.length} note{data.warnings.length === 1 ? "" : "s"} from validation
          </summary>
          <ul className="m-0 pb-3 pl-6 list-disc text-[15px] leading-5 flex flex-col gap-1.5 opacity-90">
            {data.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      {showItems && (
        <ol className="relative m-0 p-0 list-none flex flex-col">
          {data.items.map((it, i) => (
            <li
              key={it.key}
              className="flex items-center gap-3 py-[11px] border-t border-white/20 animate-rise"
              style={{ animationDelay: `${120 + i * 50}ms` }}
            >
              <span className="num w-[18px] text-[15px] opacity-70">{i + 1}</span>
              <span className="flex-1 min-w-0 font-semibold">
                {it.name}
                {it.straps && <span className="chip-outline ml-1.5 border-white/50">straps</span>}
              </span>
              {it.load != null && (
                <span className="num text-[20px]">
                  {it.load}
                  {it.unit && <span className="font-sans font-semibold text-[13px] opacity-75"> {it.unit}</span>}
                </span>
              )}
              {it.up ? (
                <span className="tag bg-white text-k-text font-extrabold">{it.up}</span>
              ) : (
                <span className="w-[38px]" aria-hidden />
              )}
            </li>
          ))}
          {data.more.length > 0 && (
            <li className="flex items-center gap-3 pt-[11px] border-t border-white/20 text-[15px] opacity-80">
              <span className="w-[18px]" aria-hidden />
              <span className="truncate">
                + {data.more.length} more, {data.more.join(", ")}
              </span>
            </li>
          )}
        </ol>
      )}

      {data.live ? (
        <LiveCta href={data.live.href} startedAt={data.live.startedAt ? Date.parse(data.live.startedAt) : null} />
      ) : startedAt != null ? (
        <LiveCta href={startHref} startedAt={startedAt} opening />
      ) : (
        <button
          type="button"
          onClick={start}
          className="btn-on-k w-fit"
        >
          <PlayIcon />
          Let&apos;s go
        </button>
      )}

      {!data.live && !sel.lastDone && !(onPlan && data.planId) && (
        <Link href="/log" className="btn-pill on-k relative w-fit -mt-2">
          Log a past session manually
        </Link>
      )}
    </section>
  );
}
