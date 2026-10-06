"use client";

import { useMemo, useState } from "react";
import { formatLoad } from "@/domain/load";
import type { LoadMode } from "@/domain/types";
import type { ExerciseCandidate } from "@/server/sessions";
import { EXERCISE_CATEGORIES } from "@/lib/constants";
import { cn, formatCategory } from "@/lib/utils";
import { Sheet } from "./sheet";
import { CloseIcon, SearchIcon } from "./icons";

export type SwapCandidate = ExerciseCandidate;

interface SwapSheetProps {
  open: boolean;
  onClose: () => void;
  /** The exercise being swapped out; null when adding one to the session. */
  replacing: { name: string; exerciseId: string; category: string } | null;
  candidates: SwapCandidate[];
  constraintRegions: string[];
  inSessionIds: string[];
  disabled?: boolean;
  /** A blocked pick carries the athlete's note for the PT ("" when they left none). */
  onPick: (c: SwapCandidate, note?: string) => void;
  /** Create an exercise the library lacks; resolves to it, or null on failure. */
  onCreate: (name: string, category: string) => Promise<SwapCandidate | null>;
}

function matches(c: SwapCandidate, words: string[]) {
  const hay = `${c.name} ${c.slug ?? ""} ${c.category}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function SwapSheet(props: SwapSheetProps) {
  return (
    <Sheet open={props.open} onClose={props.onClose} label={props.replacing ? "Swap exercise" : "Add exercise"} variant="full">
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
  onPick,
  onCreate,
}: SwapSheetProps) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<"pick-category" | "saving" | null>(null);
  const inSession = useMemo(() => new Set(inSessionIds), [inSessionIds]);
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  const name = query.trim();
  const words = name.toLowerCase().split(/\s+/).filter(Boolean);
  const pool = candidates.filter(
    (c) =>
      c.id !== replacing?.exerciseId &&
      (words.length ? matches(c, words) : !replacing || c.category === replacing.category)
  );
  const safe = pool
    .filter((c) => !c.blocked)
    .sort((a, b) => Number(inSession.has(a.id)) - Number(inSession.has(b.id)));
  const blocked = pool.filter((c) => c.blocked);
  // Adding has no category to match, so nothing to suggest.
  const suggestedId = replacing ? safe.find((c) => !inSession.has(c.id))?.id : undefined;
  const canCreate = name.length > 0 && !candidates.some((c) => c.name.toLowerCase() === name.toLowerCase());

  /** Safe picks go straight through. A blocked one is the athlete's call: warn, then flag it for the PT. */
  const pick = (c: SwapCandidate) => {
    if (!c.blocked) return onPick(c);
    const note = window.prompt(
      `${c.name} is blocked for you${c.blockedReason ? `: ${c.blockedReason.replace(/\.+$/, "")}` : ""}.\n\n` +
        "It's your call. Your PT will see it flagged. Add a note for them (optional):",
      ""
    );
    if (note == null) return;
    onPick(c, note.trim().slice(0, 300));
  };

  const create = async (category: string) => {
    setCreating("saving");
    const c = await onCreate(name, category);
    setCreating(null);
    if (c) pick(c);
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
            <span className="text-[13px] text-muted truncate">
              {replacing ? `Replacing, ${replacing.name}` : "Adding to today's session"}
            </span>
            <h1 className="m-0 num text-[30px]">{replacing ? "Swap exercise" : "Add exercise"}</h1>
          </div>
        </div>
        <label className="flex items-center gap-2.5 h-12 px-3.5 rounded-xl bg-surface border border-line focus-within:border-accent">
          <SearchIcon size={18} className="text-muted shrink-0" />
          <span className="sr-only">Search exercises</span>
          <input
            data-autofocus
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCreating(null);
            }}
            placeholder={replacing ? `Search, showing ${formatCategory(replacing.category)}` : "Search exercises"}
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
          Safe for you, {words.length ? "matches" : replacing ? "same muscle" : "all exercises"}
        </h2>
        {safe.length === 0 && (
          <p className="text-sm text-muted py-2">
            {!words.length
              ? "No safe alternatives in this category. Try searching."
              : blocked.length
                ? "Nothing safe matches. The matches below are blocked for you, but you can still pick one."
                : `Nothing in your library matches "${name}".`}
          </p>
        )}
        {safe.map((c) => {
          const already = inSession.has(c.id);
          const sub = already
            ? "Already in today's session"
            : c.lastKg != null
              ? `${formatCategory(c.category)}, last ${formatLoad(c.loadMode as LoadMode, c.lastKg)}${c.loadMode === "TOTAL" ? " kg" : ""}`
              : "No log yet, calibration weight";
          return (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => pick(c)}
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
            Blocked for you, your call
          </h2>
          {blocked.map((c) => {
            const subs = c.substitutes.filter((s) => s.id !== replacing?.exerciseId && !byId.get(s.id)?.blocked);
            return (
              <div key={c.id} className="p-3.5 rounded-[14px] bg-surface-sunk border border-danger-line flex flex-col gap-1">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(c)}
                  aria-label={`${c.name}, blocked: ${c.blockedReason ?? "constraint"}. Pick it anyway`}
                  className="flex gap-3 items-start text-left min-h-11 disabled:opacity-60"
                >
                  <span
                    aria-hidden
                    className="w-7 h-7 rounded-full bg-danger-dot flex items-center justify-center shrink-0 text-danger-soft"
                  >
                    <CloseIcon size={14} strokeWidth={3} />
                  </span>
                  <span className="grow flex flex-col gap-1 min-w-0">
                    <span className="font-semibold text-fg-2">{c.name}</span>
                    {c.blockedReason && <span className="text-[13px] text-danger-text">{c.blockedReason}</span>}
                  </span>
                  <span className="shrink-0 self-center text-[13px] font-semibold text-danger-text">Pick anyway</span>
                </button>
                {subs.map((s) => {
                  const sub = byId.get(s.id);
                  return sub ? (
                    <button
                      key={s.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => pick(sub)}
                      className="ml-10 min-h-11 text-left text-[13px] text-info"
                    >
                      Safer: {s.name} →
                    </button>
                  ) : null;
                })}
              </div>
            );
          })}
        </section>
      )}

      {canCreate && (
        <section aria-labelledby="swap-create" className="px-4 pt-6 flex flex-col gap-2">
          <h2 id="swap-create" className="eyebrow mb-0.5">
            Not in your library
          </h2>
          {creating === null ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setCreating("pick-category")}
              className="h-12 rounded-[14px] border border-dashed border-line-strong text-[15px] font-semibold text-fg-2 disabled:opacity-60"
            >
              + Create &ldquo;{name}&rdquo;
            </button>
          ) : (
            <div role="group" aria-label={`Muscle group for ${name}`} className="flex flex-col gap-2">
              <span className="text-[13px] text-muted">Which muscle group is &ldquo;{name}&rdquo;?</span>
              <div className="flex gap-2 flex-wrap">
                {EXERCISE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    disabled={disabled || creating === "saving"}
                    onClick={() => void create(cat)}
                    className="min-h-11 px-3.5 rounded-full bg-surface border border-line text-[14px] text-fg-2 disabled:opacity-60"
                  >
                    {formatCategory(cat)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
