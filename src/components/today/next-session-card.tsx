"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
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
      prefetch
      className="w-full h-[58px] rounded-[18px] bg-surface-2 text-fg shadow-[inset_0_0_0_1.5px_#FF6A2B] font-cta text-[17px] flex items-center justify-center gap-2.5"
    >
      <span className="w-2 h-2 rounded-full bg-accent animate-live-dot" />
      Live{elapsed ? ` · ${elapsed}` : ""} — {opening ? "opening session" : "open session"}
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
      className="arrive arrive-1 relative overflow-hidden mx-3 mt-[18px] p-5 rounded-[28px] bg-surface shadow-[inset_0_0_0_1px_#232327] flex flex-col gap-[18px]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[60px] -top-20 w-[220px] h-[220px] rounded-full bg-[radial-gradient(circle,rgba(255,106,43,.22),rgba(255,106,43,0)_70%)]"
      />

      <div className="relative flex justify-between items-center gap-3">
        {onPlan ? (
          data.fromPtAt ? (
            <span className="inline-flex items-center gap-2 h-7 pl-2 pr-2.5 rounded-full bg-info-bg text-info text-xs font-semibold">
              <span className="w-[7px] h-[7px] rounded-full bg-info animate-live-dot-ice" />
              From your PT · {data.fromPtAt}
              {data.dayLabel && <span className="text-info/70">· {data.dayLabel}</span>}
            </span>
          ) : (
            <span className="eyebrow text-[11px]">{data.live ? "In progress" : "Next in rotation"}</span>
          )
        ) : (
          <button
            type="button"
            onClick={() => setPick(data.plannedType)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-surface-3 text-fg-2 text-xs font-semibold"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
            </svg>
            {data.hasPtPlan ? "Back to PT plan" : `Back to ${data.plannedType}`}
          </button>
        )}

        <div className="flex flex-col items-end gap-1">
          <span id="rot-label" className="font-mono text-[10px] tracking-[0.08em] text-faint">
            ROTATION
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
                    "relative w-10 h-10 rounded-xl num text-[18px] flex items-center justify-center disabled:opacity-40",
                    on ? "bg-accent text-accent-ink" : "bg-surface-3",
                    !on && (isLast ? "text-faint" : "text-muted"),
                    !on && isPlan && "shadow-[inset_0_0_0_1.5px_rgba(140,200,255,.6)]"
                  )}
                >
                  {type}
                  {isLast && (
                    <span
                      aria-hidden
                      className={cn("absolute bottom-[5px] w-1 h-1 rounded-full", on ? "bg-accent-ink" : "bg-faint")}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="relative flex flex-col gap-1.5">
        <h2 id="next-h" key={pick} className="m-0 num text-[56px] leading-[0.9] tracking-[-0.01em] animate-slide-up">
          Session {pick}
        </h2>
        <p className="m-0 text-fg-2 text-[15px]">{sel.sub}</p>
      </div>

      {!onPlan && (
        <p key={`note-${pick}`} className="m-0 px-3.5 py-3 rounded-[14px] bg-surface-2 text-fg-2 text-[13px] leading-[1.45] animate-slide-up">
          {data.hasPtPlan ? (
            <>
              Your PT planned <b className="text-fg font-semibold">{data.plannedType}</b> for today.{" "}
            </>
          ) : (
            <>
              <b className="text-fg font-semibold">{data.plannedType}</b> is next in the rotation.{" "}
            </>
          )}
          {sel.lastDone
            ? `Starting ${pick} repeats your last Session ${pick} (${sel.lastDone}), and your PT sees the swap.`
            : `There's no Session ${pick} to repeat yet.`}
        </p>
      )}

      {onPlan && data.warnings.length > 0 && (
        <details className="group -mt-1 rounded-[14px] bg-surface-2 px-3">
          <summary className="min-h-11 flex items-center gap-2 text-[13px] text-muted cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform group-open:rotate-90">
              <path d="M9 6l6 6-6 6" />
            </svg>
            {data.warnings.length} note{data.warnings.length === 1 ? "" : "s"} from validation
          </summary>
          <ul className="m-0 pb-3 pl-6 list-disc text-[13px] text-fg-2 leading-[1.45] flex flex-col gap-1.5">
            {data.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      {showItems && (
        <ol className="relative m-0 p-0 list-none flex flex-col">
          {data.items.map((it, i) => (
            <li key={it.key} className="flex items-center gap-3 py-[11px] border-t border-line">
              <span className="num w-[18px] text-faint text-[15px]">{i + 1}</span>
              <span className="flex-1 min-w-0">
                {it.name}
                {it.straps && <span className="chip-outline ml-1.5 text-info border-info-line">straps</span>}
              </span>
              {it.load != null && (
                <span className={cn("num text-[20px]", !it.up && "text-fg-2")}>
                  {it.load}
                  {it.unit && <span className="font-sans font-medium text-xs text-muted stretch-100"> {it.unit}</span>}
                </span>
              )}
              {it.up ? (
                <span className="font-mono text-[11px] font-semibold text-info bg-info-bg px-1.5 py-[3px] rounded-md">{it.up}</span>
              ) : (
                <span className="w-[38px]" aria-hidden />
              )}
            </li>
          ))}
          {data.more.length > 0 && (
            <li className="flex items-center gap-3 pt-[11px] border-t border-line text-muted text-[13px]">
              <span className="w-[18px]" aria-hidden />
              <span className="truncate">
                + {data.more.length} more · {data.more.join(", ")}
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
        <button type="button" onClick={start} className="btn-primary group">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-2/5 bg-[linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.28),rgba(255,255,255,0))] animate-sheen"
          />
          <PlayIcon />
          Start Session {pick}
          <svg className="group-hover:animate-nudge" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      )}

      {!data.live && !sel.lastDone && !(onPlan && data.planId) && (
        <Link href="/log" className="btn-ghost w-full text-muted -mt-2">
          Log a past session manually
        </Link>
      )}
    </section>
  );
}
