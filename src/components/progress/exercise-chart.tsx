"use client";

import { useId, useRef, useState } from "react";
import { formatKg } from "@/domain/load";
import type { LoadMode } from "@/domain/types";
import { formatDdMm } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface ChartPoint {
  date: string;
  top: number | null;
  volume: number;
  rpe: number | null;
}

type Metric = "top" | "volume" | "rpe";

const METRICS: Array<{ key: Metric; tab: string; title: string; noun: string }> = [
  { key: "top", tab: "Top set", title: "Top set · kg", noun: "Top set" },
  { key: "volume", tab: "Volume", title: "Volume · kg", noun: "Volume" },
  { key: "rpe", tab: "RPE", title: "Top RPE", noun: "RPE" },
];

// Geometry from the Exercise artboard (viewBox 326 × 170).
const W = 326;
const H = 170;
const Y_TOP = 20;
const Y_BOTTOM = 120;
const X_FIRST = 60;
const X_NEXT = 290;
const X_LAST_NO_NEXT = 300;
const GRID_X0 = 32;

const NICE = [1, 2, 2.5, 5];

function niceStep(raw: number): number {
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  for (const n of NICE) if (n * base >= raw - 1e-9) return n * base;
  return 10 * base;
}

/** Three gridlines (two intervals) that contain every value. */
function scale(values: number[]): { lo: number; hi: number; step: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  let range = max - min;
  if (range <= 0) range = Math.max(Math.abs(max) * 0.2, 1);
  let step = niceStep(range / 2);
  for (let guard = 0; guard < 20; guard++) {
    const lo = Math.floor(min / step) * step;
    if (lo + 2 * step >= max - 1e-9) return { lo, hi: lo + 2 * step, step };
    step = niceStep(step * 1.01);
  }
  return { lo: min, hi: max, step: (max - min) / 2 };
}

function fmt(metric: Metric, v: number): string {
  if (metric === "volume" && v >= 1000) {
    const k = v / 1000;
    return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  return formatKg(Math.round(v * 100) / 100);
}

export default function ExerciseChart({
  points,
  nextKg,
  loadMode,
}: {
  points: ChartPoint[];
  nextKg: number | null;
  loadMode: LoadMode;
}) {
  const [metric, setMetric] = useState<Metric>("top");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();
  const meta = METRICS.find((m) => m.key === metric)!;

  const series = points
    .map((p, i) => ({ i, date: p.date, v: p[metric] }))
    .filter((p): p is { i: number; date: string; v: number } => p.v != null);
  const showNext = metric === "top" && nextKg != null && series.length > 0;
  const n = points.length;

  const xs = (i: number) => {
    if (showNext) return X_FIRST + (i * (X_NEXT - X_FIRST)) / n;
    if (n <= 1) return (X_FIRST + X_LAST_NO_NEXT) / 2;
    return X_FIRST + (i * (X_LAST_NO_NEXT - X_FIRST)) / (n - 1);
  };

  const domainValues = series.map((p) => p.v).concat(showNext ? [nextKg!] : []);
  const { lo, hi } = domainValues.length ? scale(domainValues) : { lo: 0, hi: 1 };
  const ys = (v: number) => Y_BOTTOM - ((v - lo) / (hi - lo || 1)) * (Y_BOTTOM - Y_TOP);
  const ticks = [hi, (lo + hi) / 2, lo];

  const first = series[0];
  const last = series[series.length - 1];
  const unit = metric === "rpe" ? "" : " kg";
  const unitLabel = loadMode === "PER_SIDE" && metric === "top" ? " kg per side" : unit;

  let summary = `No ${meta.noun.toLowerCase()} data yet`;
  if (first && last && first !== last) {
    const verb = last.v > first.v ? "rose" : last.v < first.v ? "fell" : "held";
    summary =
      verb === "held"
        ? `${meta.noun} held at ${fmt(metric, last.v)}${unitLabel} from ${formatDdMm(first.date)} to ${formatDdMm(last.date)}`
        : `${meta.noun} ${verb} from ${fmt(metric, first.v)}${unitLabel} on ${formatDdMm(first.date)} to ${fmt(metric, last.v)}${unitLabel} on ${formatDdMm(last.date)}`;
  } else if (last) {
    summary = `${meta.noun} ${fmt(metric, last.v)}${unitLabel} on ${formatDdMm(last.date)}`;
  }
  if (showNext) summary += `; next target ${formatKg(nextKg!)}${unitLabel}`;

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % METRICS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + METRICS.length) % METRICS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = METRICS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setMetric(METRICS[next].key);
    tabRefs.current[next]?.focus();
  }

  const lastX = last ? xs(last.i) : 0;
  const lastY = last ? ys(last.v) : 0;
  const nextY = showNext ? ys(nextKg!) : 0;
  const firstX = first ? xs(first.i) : 0;
  const showFirstLabel = first && last && first !== last && lastX - firstX > 44;

  return (
    <section aria-label="Progress chart" className="card mx-4 mt-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="eyebrow">{meta.title}</h2>
        <div role="tablist" aria-label="Chart metric" className="flex bg-bg rounded-[10px] p-[3px]">
          {METRICS.map((m, idx) => {
            const selected = m.key === metric;
            return (
              <button
                key={m.key}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${m.key}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setMetric(m.key)}
                onKeyDown={(e) => onKeyDown(e, idx)}
                className={cn(
                  "relative h-8 px-2.5 rounded-lg text-[13px] after:absolute after:inset-x-0 after:-inset-y-1.5",
                  selected ? "bg-line font-semibold text-fg" : "text-muted hover:text-fg-2"
                )}
              >
                {m.tab}
              </button>
            );
          })}
        </div>
      </div>

      <figure
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${metric}`}
        className="m-0"
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto block"
          role="img"
          aria-label={summary}
        >
          {[Y_TOP, (Y_TOP + Y_BOTTOM) / 2, Y_BOTTOM].map((y) => (
            <line key={y} x1={GRID_X0} y1={y} x2={W} y2={y} className="stroke-line-soft" />
          ))}
          {ticks.map((t, k) => (
            <text
              key={k}
              x={0}
              y={[Y_TOP, (Y_TOP + Y_BOTTOM) / 2, Y_BOTTOM][k] + 4}
              className="fill-muted font-sans"
              fontSize={11}
            >
              {fmt(metric, t)}
            </text>
          ))}

          {series.length > 1 && (
            <polyline
              points={series.map((p) => `${xs(p.i)},${ys(p.v)}`).join(" ")}
              fill="none"
              className="stroke-info"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {showNext && last && (
            <line
              x1={lastX}
              y1={lastY}
              x2={X_NEXT}
              y2={nextY}
              className="stroke-accent"
              strokeWidth={2}
              strokeDasharray="5 5"
            />
          )}

          {series.map((p, k) => {
            const isLast = k === series.length - 1;
            const r = series.length > 6 ? 4.5 : 6;
            return isLast ? (
              <circle key={p.i} cx={xs(p.i)} cy={ys(p.v)} r={6} className="fill-info" />
            ) : (
              <circle
                key={p.i}
                cx={xs(p.i)}
                cy={ys(p.v)}
                r={r}
                className="fill-bg stroke-info"
                strokeWidth={3}
              />
            );
          })}

          {showNext && (
            <circle
              cx={X_NEXT}
              cy={nextY}
              r={6}
              className="fill-bg stroke-accent"
              strokeWidth={2}
              strokeDasharray="3 2"
            />
          )}

          {last && (
            <text
              x={lastX}
              y={Math.max(12, lastY - 11)}
              textAnchor="middle"
              className="fill-fg font-display"
              fontSize={13}
              fontWeight={600}
            >
              {fmt(metric, last.v)}
            </text>
          )}
          {showNext && (
            <text
              x={Math.min(W - 2, X_NEXT)}
              y={Math.max(12, nextY - 11)}
              textAnchor="middle"
              className="fill-accent font-display"
              fontSize={13}
              fontWeight={600}
            >
              {formatKg(nextKg!)}?
            </text>
          )}

          {showFirstLabel && (
            <text x={firstX} y={150} textAnchor="middle" className="fill-muted font-sans" fontSize={11}>
              {formatDdMm(first.date)}
            </text>
          )}
          {last && (
            <text x={lastX} y={150} textAnchor="middle" className="fill-muted font-sans" fontSize={11}>
              {formatDdMm(last.date)}
            </text>
          )}
          {showNext && (
            <text x={X_NEXT} y={150} textAnchor="middle" className="fill-muted font-sans" fontSize={11}>
              Next
            </text>
          )}
        </svg>
        <figcaption className="sr-only">
          <table>
            <caption>{meta.title} by session</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">{meta.noun}</th>
              </tr>
            </thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.i}>
                  <td>{formatDdMm(p.date)}</td>
                  <td>
                    {fmt(metric, p.v)}
                    {unitLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </figcaption>
      </figure>
    </section>
  );
}
