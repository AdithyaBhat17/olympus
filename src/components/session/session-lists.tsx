"use client";

import type { LiveItemView } from "@/server/sessions";
import { cn } from "@/lib/utils";
import { CheckIcon } from "./icons";
import { StrapsChip } from "./exercise-card";
import { completedSummary, upNextSummary } from "./format";

export function CompletedList({
  items,
  onSelect,
}: {
  items: LiveItemView[];
  onSelect: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Completed exercises" className="mx-4 mt-4 flex flex-col gap-2">
      {items.map((it) => {
        const { text, pr } = completedSummary(it);
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onSelect(it.key)}
            aria-label={`${it.exercise.name}, done: ${text}${pr ? ", top set PR" : ""}. Open`}
            className="flex items-center gap-3 px-3.5 py-3 min-h-11 rounded-xl bg-surface-sunk border border-line-soft text-left"
          >
            <span className="w-6 h-6 rounded-full bg-info-bg flex items-center justify-center text-info shrink-0">
              <CheckIcon size={14} />
            </span>
            <span className="grow text-muted truncate">{it.exercise.name}</span>
            {pr && (
              <span className="text-xs font-semibold text-info-ink bg-info rounded-md px-1.5 py-0.5 shrink-0">
                Top set ↑
              </span>
            )}
            <span
              className={cn(
                "font-display text-lg tabular-nums whitespace-nowrap",
                pr ? "text-fg" : "text-muted"
              )}
            >
              {text}
            </span>
          </button>
        );
      })}
    </section>
  );
}

export function UpNextList({
  items,
  onSelect,
}: {
  items: LiveItemView[];
  onSelect: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="up-next" className="mx-4 mt-5 flex flex-col">
      <h2 id="up-next" className="eyebrow mb-2">
        Up next
      </h2>
      {items.map((it, i) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onSelect(it.key)}
          className={cn(
            "flex justify-between items-center gap-3 py-3.5 min-h-11 text-left",
            i < items.length - 1 && "border-b border-line-soft"
          )}
        >
          <span className="min-w-0">
            {it.exercise.name}
            {it.straps && <StrapsChip />}
          </span>
          <span className="font-display text-lg text-muted tabular-nums whitespace-nowrap">
            {upNextSummary(it)}
          </span>
        </button>
      ))}
    </section>
  );
}
