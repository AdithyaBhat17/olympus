"use client";

import { useId, useMemo, useState } from "react";
import { formatKg } from "@/domain/load";
import type { LoadMode } from "@/domain/types";
import { formatDdMm } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface ChartPoint {
  date: string;
  top: number | null;
}

type Range = "4w" | "12w" | "all";
const RANGES: Array<{ key: Range; label: string; days: number | null }> = [
  { key: "4w", label: "4W", days: 28 },
  { key: "12w", label: "12W", days: 84 },
  { key: "all", label: "All", days: null },
];

// Geometry (viewBox 342 × 170): plot spans x 0–310, y 40 (hi) → 140 (lo).
const W = 342;
const H = 170;
const PLOT_W = 310;
const Y_TOP = 40;
const Y_BOTTOM = 140;

const NICE = [1, 2, 2.5, 5];

function niceStep(raw: number): number {
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  for (const n of NICE) if (n * base >= raw - 1e-9) return n * base;
  return 10 * base;
}

/** Three gridlines (two intervals) that contain every value. */
function scale(values: number[]): { lo: number; hi: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  let range = max - min;
  if (range <= 0) range = Math.max(Math.abs(max) * 0.2, 1);
  let step = niceStep(range / 2);
  for (let guard = 0; guard < 20; guard++) {
    const lo = Math.floor(min / step) * step;
    if (lo + 2 * step >= max - 1e-9) return { lo, hi: lo + 2 * step };
    step = niceStep(step * 1.01);
  }
  return { lo: min, hi: max };
}

/**
 * Top set over time: ember line draws on, the area fades in, the last point
 * pulses. Range control 4W / 12W / All. Screen readers get a summary and the
 * data table.
 */
export default function ExerciseChart({
  points,
  today,
  loadMode,
}: {
  points: ChartPoint[];
  /** YYYY-MM-DD, for the range cut-off. */
  today: string;
  loadMode: LoadMode;
}) {
  const [range, setRange] = useState<Range>("12w");
  const baseId = useId();

  const series = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    const cutoff = days == null ? null : Date.parse(`${today}T12:00:00Z`) - days * 86_400_000;
    return points.filter(
      (p): p is { date: string; top: number } =>
        p.top != null && (cutoff == null || Date.parse(`${p.date}T12:00:00Z`) >= cutoff)
    );
  }, [points, range, today]);

  const { lo, hi } = series.length ? scale(series.map((p) => p.top)) : { lo: 0, hi: 1 };
  // Counterweight: lower is harder, so flip the axis to keep "up = progress".
  const flip = loadMode === "COUNTERWEIGHT";
  const ys = (v: number) => {
    const t = (v - lo) / (hi - lo || 1);
    return flip ? Y_TOP + t * (Y_BOTTOM - Y_TOP) : Y_BOTTOM - t * (Y_BOTTOM - Y_TOP);
  };
  const xs = (i: number) => (series.length <= 1 ? PLOT_W / 2 : (i * PLOT_W) / (series.length - 1));
  const pts = series.map((p, i) => [Math.round(xs(i) * 10) / 10, Math.round(ys(p.top) * 10) / 10] as const);
  const last = pts[pts.length - 1];
  const ticks = [
    { y: Y_TOP, v: flip ? lo : hi },
    { y: (Y_TOP + Y_BOTTOM) / 2, v: (lo + hi) / 2 },
    { y: Y_BOTTOM, v: flip ? hi : lo },
  ];
  const unit = loadMode === "PER_SIDE" ? " kg per side" : " kg";

  const first = series[0];
  const end = series[series.length - 1];
  let summary = "No top sets in this range";
  if (first && end && first !== end) {
    summary = `Top set went from ${formatKg(first.top)} to ${formatKg(end.top)}${unit} between ${formatDdMm(first.date)} and ${formatDdMm(end.date)}`;
  } else if (end) {
    summary = `Top set ${formatKg(end.top)}${unit} on ${formatDdMm(end.date)}`;
  }

  const lineLen = pts.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

  return (
    <section
      aria-label="Top set over time"
      className="arrive arrive-1 mx-3 mt-4 pt-4 px-3 pb-3 rounded-[24px] bg-surface shadow-[inset_0_0_0_1px_#232327]"
    >
      <figure id={`${baseId}-panel`} className="m-0">
        <svg key={range} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={summary}>
          <defs>
            <linearGradient id={`${baseId}-g`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FF6A2B" stopOpacity=".28" />
              <stop offset="1" stopColor="#FF6A2B" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t.y}>
              <line x1={0} y1={t.y} x2={W} y2={t.y} stroke="#232327" strokeWidth={1} strokeDasharray="2 4" />
              <text x={W - 4} y={t.y - 4} textAnchor="end" fill="#5E5C58" fontSize={10} className="font-mono">
                {formatKg(Math.round(t.v * 100) / 100)}
              </text>
            </g>
          ))}
          {pts.length > 1 && (
            <>
              <path
                d={`M${pts[0][0]},${H} L${pts.map((p) => p.join(",")).join(" L")} L${last[0]},${H} Z`}
                fill={`url(#${baseId}-g)`}
                className="animate-fade-late"
              />
              <polyline
                points={pts.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke="#FF6A2B"
                strokeWidth={3}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={Math.ceil(lineLen)}
                className="animate-draw"
                style={{ ["--len" as string]: Math.ceil(lineLen) }}
              />
            </>
          )}
          {last && (
            <>
              <circle
                cx={last[0]}
                cy={last[1]}
                r={5}
                fill="none"
                stroke="#FF6A2B"
                strokeWidth={2}
                className="animate-ping"
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
              <circle cx={last[0]} cy={last[1]} r={5} fill="#FF6A2B" stroke="#141416" strokeWidth={2} />
            </>
          )}
          {first && end && first !== end && (
            <>
              <text x={2} y={H - 4} fill="#5E5C58" fontSize={10} className="font-mono">
                {formatDdMm(first.date)}
              </text>
              <text x={PLOT_W} y={H - 4} textAnchor="end" fill="#5E5C58" fontSize={10} className="font-mono">
                {formatDdMm(end.date)}
              </text>
            </>
          )}
        </svg>
        <figcaption className="sr-only">
          <table>
            <caption>Top set by session</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Top set</th>
              </tr>
            </thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.date}>
                  <td>{formatDdMm(p.date)}</td>
                  <td>
                    {formatKg(p.top)}
                    {unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </figcaption>
      </figure>
      <div role="radiogroup" aria-label="Range" className="seg mt-2.5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            role="radio"
            aria-checked={range === r.key}
            aria-controls={`${baseId}-panel`}
            onClick={() => setRange(r.key)}
            className={cn("seg-btn h-11", range === r.key && "seg-on")}
          >
            {r.label}
          </button>
        ))}
      </div>
    </section>
  );
}
