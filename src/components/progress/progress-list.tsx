"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDdMm } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface ProgressRow {
  id: string;
  name: string;
  category: string;
  /** formatLoad output: "85", "47 cw", "21.1/side". */
  load: string;
  unit: string | null;
  lastDate: string;
  trend: "up" | "down" | "flat";
  trendLabel: string;
}

export default function ProgressList({ rows }: { rows: ProgressRow[] }) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hits = words.length
      ? rows.filter((r) => {
          const hay = `${r.name} ${r.category}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        })
      : rows;
    const out: Array<{ category: string; rows: ProgressRow[] }> = [];
    for (const r of hits) {
      const last = out[out.length - 1];
      if (last && last.category === r.category) last.rows.push(r);
      else out.push({ category: r.category, rows: [r] });
    }
    return out;
  }, [rows, query]);

  if (rows.length === 0) {
    return (
      <div className="mx-4 mt-6 card flex flex-col gap-2">
        <p className="text-[22px] font-extrabold">Nothing logged yet</p>
        <p className="text-[15px] text-muted leading-5">
          Finish a session and each lift shows up here with its working weight and trend.
        </p>
        <Link href="/today" className="btn-secondary mt-2">
          Go to Today
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-4 pb-1">
        <label className="flex items-center gap-2.5 h-12 px-3.5 rounded-full bg-surface transition-shadow focus-within:ring-[2.5px] focus-within:ring-inset focus-within:ring-accent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="text-muted shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span className="sr-only">Search lifts</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lifts"
            className="flex-1 min-w-0 bg-transparent text-[16px] text-fg placeholder:text-faint outline-none"
          />
        </label>
      </div>

      {groups.length === 0 && (
        <p className="px-5 py-8 text-sm text-muted text-center">No lifts match “{query.trim()}”.</p>
      )}

      {groups.map((g) => (
        <section key={g.category} aria-label={g.category} className="mx-4 mt-6">
          <h2 className="section-label mx-1.5 mb-2.5">{g.category.replace(/ — /g, ", ")}</h2>
          <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
            {g.rows.map((r, i) => (
              <li key={r.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                <Link
                  href={`/progress/${r.id}`}
                  className="press-soft group flex items-center gap-3 min-h-[64px] py-2.5 pl-[18px] pr-3.5 rounded-[22px] bg-surface"
                >
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="truncate font-bold">{r.name}</span>
                    <span className="text-[15px] text-muted">Last {formatDdMm(r.lastDate)}</span>
                  </div>
                  <span className="num text-[22px]">
                    {r.load}
                    {r.unit && <span className="text-[13px] text-muted font-bold"> {r.unit}</span>}
                  </span>
                  <TrendMark trend={r.trend} label={r.trendLabel} />
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-faint shrink-0 transition-transform duration-200 group-hover:translate-x-[3px]">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TrendMark({ trend, label }: { trend: ProgressRow["trend"]; label: string }) {
  return (
    <span
      title={label}
      className={cn(
        "w-7 h-7 rounded-full inline-flex items-center justify-center num text-[15px] shrink-0",
        trend === "up" ? "bg-apricot text-apricot-ink" : trend === "down" ? "bg-bg text-danger-text" : "text-faint"
      )}
    >
      <span aria-hidden="true">{trend === "up" ? "↑" : trend === "down" ? "↓" : "–"}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
