"use client";

import { useMemo, useState } from "react";
import { formatLoad } from "@/domain/load";
import type { LoadMode } from "@/domain/types";
import type { ExerciseSearchHit } from "@/server/exercises";
import { cn } from "@/lib/utils";
import { Sheet } from "./sheet";
import { CloseIcon, SearchIcon } from "./icons";

export interface SwapCandidate extends ExerciseSearchHit {
  /** Current working weight (last top set or override), true kg. */
  lastKg: number | null;
}

interface SwapSheetProps {
  open: boolean;
  onClose: () => void;
  replacing: { name: string; exerciseId: string; category: string };
  candidates: SwapCandidate[];
  constraintRegions: string[];
  inSessionIds: string[];
  disabled?: boolean;
  onSwap: (exerciseId: string, overrideReason?: string) => void;
}

function matches(c: SwapCandidate, words: string[]) {
  const hay = `${c.name} ${c.slug ?? ""} ${c.category}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function SwapSheet(props: SwapSheetProps) {
  return (
    <Sheet open={props.open} onClose={props.onClose} label="Swap exercise" variant="full">
      {props.open && <SwapBody {...props} />}
    </Sheet>
  );
}

function SwapBody({
  onClose,
  replacing,
  candidates,
  constraintRegions,
  inSessionIds,
  disabled,
  onSwap,
}: SwapSheetProps) {
  const [query, setQuery] = useState("");
  const [overrideMode, setOverrideMode] = useState(false);
  const inSession = useMemo(() => new Set(inSessionIds), [inSessionIds]);
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const pool = candidates.filter(
    (c) =>
      c.id !== replacing.exerciseId &&
      (words.length ? matches(c, words) : c.category === replacing.category)
  );
  const safe = pool
    .filter((c) => !c.blocked)
    .sort((a, b) => Number(inSession.has(a.id)) - Number(inSession.has(b.id)));
  const blocked = pool.filter((c) => c.blocked);
  const suggestedId = safe.find((c) => !inSession.has(c.id))?.id;

  const overrideSwap = (c: SwapCandidate) => {
    const reason = window.prompt(
      `Why log ${c.name} anyway? This goes to your PT as a flag.`,
      ""
    );
    if (reason == null) return;
    if (!reason.trim()) return;
    onSwap(c.id, reason.trim().slice(0, 300));
  };

  return (
    <div className="flex flex-col min-h-full pb-8">
      <header className="safe-top px-4 pb-3 flex flex-col gap-3.5 sticky top-0 bg-bg z-10">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="w-11 h-11 -ml-1 flex items-center justify-center text-fg"
          >
            <CloseIcon size={22} />
          </button>
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] text-muted truncate">Replacing · {replacing.name}</span>
            <h1 className="m-0 num text-[30px]">Swap exercise</h1>
          </div>
        </div>
        <label className="flex items-center gap-2.5 h-12 px-3.5 rounded-xl bg-surface border border-line focus-within:border-accent">
          <SearchIcon size={18} className="text-muted shrink-0" />
          <span className="sr-only">Search exercises</span>
          <input
            data-autofocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search — showing ${replacing.category}`}
            autoComplete="off"
            className="grow min-w-0 border-none bg-transparent text-fg text-base outline-none placeholder:text-faint"
          />
        </label>
        {constraintRegions.length > 0 && (
          <div aria-label="Active constraints" className="flex gap-2 flex-wrap">
            {constraintRegions.map((r, i) => (
              <span
                key={r}
                className={cn(
                  "text-[13px] px-2.5 py-1.5 rounded-full border",
                  i === 0
                    ? "bg-danger-bg border-danger-line text-danger-text"
                    : "bg-surface-2 border-line text-fg-2"
                )}
              >
                {r}
              </span>
            ))}
          </div>
        )}
      </header>

      <section aria-labelledby="swap-safe" className="px-4 pt-2 flex flex-col gap-2">
        <h2 id="swap-safe" className="eyebrow mb-0.5">
          Safe for you · {words.length ? "matches" : "same muscle"}
        </h2>
        {safe.length === 0 && (
          <p className="text-sm text-muted py-2">
            {words.length ? "Nothing safe matches that search." : "No safe alternatives in this category — try searching."}
          </p>
        )}
        {safe.map((c) => {
          const already = inSession.has(c.id);
          const sub = already
            ? "Already in today's session"
            : c.lastKg != null
              ? `${c.category} · last ${formatLoad(c.loadMode as LoadMode, c.lastKg)}${c.loadMode === "TOTAL" ? " kg" : ""}`
              : "No log yet · calibration weight";
          return (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => onSwap(c.id)}
              className={cn(
                "text-left p-3.5 rounded-[14px] bg-surface flex items-center gap-3 min-h-11 disabled:opacity-60",
                c.id === suggestedId ? "border-2 border-accent" : "border border-line"
              )}
            >
              <span className="grow flex flex-col gap-[3px] min-w-0">
                <span className="font-semibold text-base">{c.name}</span>
                <span className="text-[13px] text-muted">{sub}</span>
              </span>
              {c.lastKg != null ? (
                <span
                  className={cn(
                    "num text-[22px] shrink-0",
                    already && "text-muted"
                  )}
                >
                  {formatLoad(c.loadMode as LoadMode, c.lastKg)}
                </span>
              ) : (
                <span className="text-xs font-semibold text-accent-ink bg-accent-soft rounded-md px-[7px] py-[3px] shrink-0">
                  Calibrate
                </span>
              )}
            </button>
          );
        })}
      </section>

      {blocked.length > 0 && (
        <section aria-labelledby="swap-blocked" className="px-4 pt-6 flex flex-col gap-2">
          <h2 id="swap-blocked" className="eyebrow mb-0.5">
            Blocked · won&apos;t be programmed
          </h2>
          {blocked.map((c) => {
            const subs = c.substitutes.filter((s) => s.id !== replacing.exerciseId && !byId.get(s.id)?.blocked);
            const body = (
              <>
                <span
                  aria-hidden
                  className="w-7 h-7 rounded-full bg-danger-dot flex items-center justify-center shrink-0 text-danger-soft"
                >
                  <CloseIcon size={14} strokeWidth={3} />
                </span>
                <span className="flex flex-col gap-1 min-w-0">
                  <span className="font-semibold text-fg-2 line-through decoration-faint">{c.name}</span>
                  {c.blockedReason && <span className="text-[13px] text-danger-text">{c.blockedReason}</span>}
                </span>
              </>
            );
            return (
              <div
                key={c.id}
                className={cn(
                  "p-3.5 rounded-[14px] bg-surface-sunk border flex flex-col gap-1",
                  overrideMode ? "border-danger-line" : "border-line-soft"
                )}
              >
                {overrideMode ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => overrideSwap(c)}
                    aria-label={`Log ${c.name} anyway (blocked: ${c.blockedReason ?? "constraint"})`}
                    className="flex gap-3 items-start text-left min-h-11"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex gap-3 items-start">{body}</div>
                )}
                {subs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSwap(s.id)}
                    className="ml-10 min-h-11 text-left text-[13px] text-info"
                  >
                    Use instead → {s.name}
                  </button>
                ))}
              </div>
            );
          })}
          <button
            type="button"
            aria-pressed={overrideMode}
            onClick={() => setOverrideMode((v) => !v)}
            className={cn(
              "mt-1 h-11 rounded-[10px] border border-dashed bg-transparent text-sm",
              overrideMode ? "border-danger-line text-danger-text" : "border-line-strong text-muted"
            )}
          >
            {overrideMode ? "Pick the blocked exercise above — or tap to cancel" : "Log it anyway — I'll take the flag"}
          </button>
        </section>
      )}
    </div>
  );
}
