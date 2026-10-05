"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn, kindClass } from "@/lib/utils";

/** A session letter (A, B, C…), "cardio", or "other" (manual / unlabelled). */
export type SessionKind = string;

export interface HistorySession {
  id: string;
  date: string;
  /** "Thu 1 Oct, Push + legs" */
  title: string;
  /** "48 min, 18 sets, RPE 8.0" */
  meta: string;
  kind: SessionKind;
  live: boolean;
  sent: boolean;
}

export interface HistoryDay {
  date: string;
  kind: SessionKind | null;
  today: boolean;
  future: boolean;
}

/** Session colour block for a kind: same palette as Today and the lifting screen. */
const cell = (kind: SessionKind) => cn(kindClass(kind), "bg-k text-k-on");


function KindTile({ kind }: { kind: SessionKind }) {
  return (
    <span aria-hidden className={cn(cell(kind), "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 num text-[20px]")}>
      {kind === "cardio" || kind === "other" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {kind === "cardio" ? <path d="M3 12h4l3-8 4 16 3-8h4" /> : <path d="M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12" />}
        </svg>
      ) : (
        kind
      )}
    </span>
  );
}

function groupLabel(date: string, thisMonday: string, lastMonday: string): string {
  if (date >= thisMonday) return "This week";
  if (date >= lastMonday) return "Last week";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default function HistoryList({
  sessions,
  days,
  range,
  stats,
  thisMonday,
  lastMonday,
  rotation,
}: {
  sessions: HistorySession[];
  days: HistoryDay[];
  range: string;
  stats: { thisWeek: number; avg: number; streak: number };
  thisMonday: string;
  lastMonday: string;
  /** The athlete's session letters, in order. */
  rotation: string[];
}) {
  const [filter, setFilter] = useState<SessionKind | null>(null);
  const filters: Array<{ id: SessionKind | null; label: string }> = [
    { id: null, label: "All" },
    ...rotation.map((k) => ({ id: k, label: k })),
    { id: "cardio", label: "Cardio" },
  ];
  const match = (k: SessionKind) => filter == null || k === filter || (filter === "cardio" && k === "other");

  const groups = useMemo(() => {
    const out: Array<{ label: string; rows: HistorySession[] }> = [];
    for (const s of sessions) {
      if (!match(s.kind) && !s.live) continue;
      const label = s.live ? "In progress" : groupLabel(s.date, thisMonday, lastMonday);
      const g = out[out.length - 1];
      if (g?.label === label) g.rows.push(s);
      else out.push({ label, rows: [s] });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, filter, thisMonday, lastMonday]);

  return (
    <>
      <section
        aria-label="Training calendar, last five weeks"
        className="arrive arrive-1 mx-4 mt-4 px-4 py-[18px] rounded-[32px] bg-surface"
      >
        <div className="flex justify-between items-center mb-3">
          <span className="text-[20px] font-extrabold">{range}</span>
          <span className="flex gap-2.5 text-[13px] font-semibold text-muted">
            {rotation.map((k) => (
              <span key={k} className="flex items-center gap-[5px]">
                <span className={cn("w-2.5 h-2.5 rounded-full", cell(k))} />
                {k}
              </span>
            ))}
            <span className="flex items-center gap-[5px]">
              <span className={cn("w-2.5 h-2.5 rounded-full", cell("cardio"))} />
              Cardio
            </span>
          </span>
        </div>
        <div aria-hidden className="grid grid-cols-7 gap-1.5 text-[13px] font-semibold text-muted text-center mb-1.5">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5" role="list">
          {days.map((d, i) => {
            const on = d.kind != null && match(d.kind);
            return (
              <span
                key={d.date}
                role="listitem"
                aria-label={`${d.date}${d.kind ? `: ${d.kind === "cardio" ? "cardio" : d.kind === "other" ? "session" : `Session ${d.kind}`}` : ""}${d.today ? ", today" : ""}`}
                className={cn(
                  "aspect-square rounded-full flex items-center justify-center num text-[15px] animate-pop-in transition-colors duration-200",
                  on ? cn(cell(d.kind!), "font-extrabold") : "text-muted font-semibold",
                  d.future && "opacity-40",
                  d.today && !on && "text-accent ring-[3px] ring-inset ring-accent"
                )}
                style={{ animationDelay: `${i * 12}ms` }}
              >
                {Number(d.date.slice(8))}
              </span>
            );
          })}
        </div>
        <div className="flex justify-between mt-4 pt-3.5 border-t border-surface-3">
          {[
            { v: stats.thisWeek, l: "This week" },
            { v: stats.avg, l: "Avg / week" },
            { v: stats.streak, l: "Week streak" },
          ].map((s) => (
            <span key={s.l} className="flex flex-col">
              <span className="num text-[24px]">{s.v}</span>
              <span className="text-[13px] font-semibold text-muted">{s.l}</span>
            </span>
          ))}
        </div>
      </section>

      <div role="group" aria-label="Filter" className="arrive arrive-2 flex gap-2 px-4 pt-4 overflow-x-auto scroller">
        {filters.map((f) => (
          <button
            key={f.label}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn("chip h-11 transition-colors", filter === f.id && "chip-on")}
          >
            {f.label}
          </button>
        ))}
      </div>

      {sessions.length === 0 ? (
        <div className="mx-4 mt-6 card flex flex-col gap-2 px-5 py-5">
          <p className="m-0 text-[22px] font-extrabold">Nothing logged yet</p>
          <p className="m-0 text-[15px] text-muted leading-5">Start today&apos;s session from Today, or add an old one by hand.</p>
        </div>
      ) : groups.length === 0 ? (
        <p className="px-5 py-10 text-[15px] text-muted text-center">No sessions of that type in the last few weeks.</p>
      ) : (
        groups.map((g, gi) => (
          <section key={`${g.label}-${gi}`} aria-labelledby={`g-${gi}`} className="arrive arrive-3 mx-4 mt-6">
            <h2 id={`g-${gi}`} className="section-label mx-1.5 mb-2.5">
              {g.label}
            </h2>
            <div className="flex flex-col gap-2">
              {g.rows.map((s, ri) => (
                <Link
                  key={s.id}
                  href={s.live ? `/session/${s.id}` : `/session/${s.id}/finish`}
                  className="press-soft group flex items-center gap-3.5 py-3 pl-3 pr-4 rounded-3xl bg-surface text-fg animate-rise"
                  style={{ animationDelay: `${Math.min(gi * 3 + ri, 12) * 45}ms` }}
                >
                  <KindTile kind={s.kind} />
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="font-bold truncate">{s.title}</span>
                    <span className="text-[15px] text-muted truncate">{s.meta}</span>
                  </span>
                  {s.live ? (
                    <span className="flex items-center gap-1.5 text-[13px] font-bold text-accent">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-live-dot" />
                      Live
                    </span>
                  ) : s.kind !== "cardio" ? (
                    <span
                      className={cn("tag font-extrabold", s.sent ? "bg-bg text-muted" : "tag-apricot")}
                    >
                      {s.sent ? "Sent" : "Not sent"}
                    </span>
                  ) : null}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-faint transition-transform duration-200 group-hover:translate-x-[3px] group-active:translate-x-[3px]"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
