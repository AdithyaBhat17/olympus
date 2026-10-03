"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** A/B/C rotation, X = cardio, O = other / manual. */
export type SessionKind = "A" | "B" | "C" | "X" | "O";

export interface HistorySession {
  id: string;
  date: string;
  /** "Thu 1 Oct · Push + legs" */
  title: string;
  /** "48 min · 18 sets · RPE 8.0" */
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

const CELL: Record<SessionKind, string> = {
  A: "bg-accent",
  B: "bg-info",
  C: "bg-fg",
  X: "bg-cardio",
  O: "bg-cardio",
};

const FILTERS: Array<{ id: SessionKind | null; label: string }> = [
  { id: null, label: "All" },
  { id: "A", label: "A" },
  { id: "B", label: "B" },
  { id: "C", label: "C" },
  { id: "X", label: "Cardio" },
];

function KindTile({ kind }: { kind: SessionKind }) {
  const base = "w-9 h-9 rounded-[11px] flex items-center justify-center shrink-0";
  if (kind === "X" || kind === "O") {
    return (
      <span className={cn(base, "bg-cardio text-fg")} aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {kind === "X" ? <path d="M3 12h4l3-8 4 16 3-8h4" /> : <path d="M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12" />}
        </svg>
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(base, "num text-[18px]", kind === "A" ? "bg-accent text-accent-ink" : kind === "B" ? "bg-info text-bg" : "bg-fg text-bg")}
    >
      {kind}
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
}: {
  sessions: HistorySession[];
  days: HistoryDay[];
  range: string;
  stats: { thisWeek: number; avg: number; streak: number };
  thisMonday: string;
  lastMonday: string;
}) {
  const [filter, setFilter] = useState<SessionKind | null>(null);
  const match = (k: SessionKind) => filter == null || k === filter || (filter === "X" && k === "O");

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
        className="arrive arrive-1 mx-3 mt-[18px] p-4 rounded-[24px] bg-surface shadow-[inset_0_0_0_1px_#232327]"
      >
        <div className="flex justify-between items-center mb-3">
          <span className="font-semibold">{range}</span>
          <span className="flex gap-2.5 text-xs text-muted">
            {(["A", "B", "C"] as const).map((k) => (
              <span key={k} className="flex items-center gap-[5px]">
                <span className={cn("w-2 h-2 rounded-[3px]", CELL[k])} />
                {k}
              </span>
            ))}
            <span className="flex items-center gap-[5px]">
              <span className="w-2 h-2 rounded-[3px] bg-cardio" />
              Cardio
            </span>
          </span>
        </div>
        <div aria-hidden className="grid grid-cols-7 gap-1.5 text-[11px] text-faint text-center mb-1.5">
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
                aria-label={`${d.date}${d.kind ? `: ${d.kind === "X" ? "cardio" : d.kind === "O" ? "session" : `Session ${d.kind}`}` : ""}${d.today ? ", today" : ""}`}
                className={cn(
                  "aspect-square rounded-lg animate-day-pop transition-colors duration-200",
                  on ? CELL[d.kind!] : "bg-[#1A1A1D]",
                  d.future && "opacity-40",
                  d.today && "shadow-[0_0_0_2px_#0A0A0B,0_0_0_3.5px_#F5F3EE]"
                )}
                style={{ animationDelay: `${i * 12}ms` }}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-3.5 pt-3 border-t border-line">
          {[
            { v: stats.thisWeek, l: "This week" },
            { v: stats.avg, l: "Avg / week" },
            { v: stats.streak, l: "Week streak" },
          ].map((s) => (
            <span key={s.l} className="flex flex-col">
              <span className="num text-[24px]">{s.v}</span>
              <span className="text-xs text-muted">{s.l}</span>
            </span>
          ))}
        </div>
      </section>

      <div role="group" aria-label="Filter" className="arrive arrive-2 flex gap-1.5 px-3 pt-4 overflow-x-auto scroller">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn("chip h-11 sm:h-[34px]", filter === f.id && "chip-on")}
          >
            {f.label}
          </button>
        ))}
      </div>

      {sessions.length === 0 ? (
        <div className="mx-3 mt-6 card flex flex-col gap-2">
          <p className="m-0 font-semibold">No sessions logged yet</p>
          <p className="m-0 text-sm text-muted leading-[1.45]">Start today&apos;s session from Today, or add an old one by hand.</p>
        </div>
      ) : groups.length === 0 ? (
        <p className="px-5 py-10 text-sm text-muted text-center">No sessions of that type in the last few weeks.</p>
      ) : (
        groups.map((g, gi) => (
          <section key={`${g.label}-${gi}`} aria-labelledby={`g-${gi}`} className="arrive arrive-3 mx-3 mt-[18px]">
            <h2 id={`g-${gi}`} className="section-label mx-2 mb-2.5">
              {g.label}
            </h2>
            <div className="card-group">
              {g.rows.map((s) => (
                <Link
                  key={s.id}
                  href={s.live ? `/session/${s.id}` : `/session/${s.id}/finish`}
                  className="press-soft group flex items-center gap-3.5 px-4 py-3.5 text-fg border-b border-line last:border-b-0"
                >
                  <KindTile kind={s.kind} />
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="font-semibold truncate">{s.title}</span>
                    <span className="text-[13px] text-muted truncate">{s.meta}</span>
                  </span>
                  {s.live ? (
                    <span className="flex items-center gap-1.5 text-xs text-accent">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-live-dot" />
                      Live
                    </span>
                  ) : s.kind !== "X" ? (
                    <span className={cn("text-xs", s.sent ? "text-info" : "text-accent")}>{s.sent ? "Sent" : "Not sent"}</span>
                  ) : null}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#5E5C58"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="transition-transform duration-200 group-hover:translate-x-[3px] group-active:translate-x-[3px]"
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
