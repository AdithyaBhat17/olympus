"use client";

import { formatKg } from "@/domain/load";
import type { LiveItemView } from "@/server/sessions";
import { cn } from "@/lib/utils";
import { CheckIcon } from "./icons";
import { StrapsChip } from "./exercise-card";
import { completedSummary, openKg, plannedMinutes } from "./format";

const row =
  "press-soft w-full flex items-center gap-3 min-h-14 px-4 bg-transparent text-left text-[15px] border-b border-line last:border-b-0";

export function CompletedList({
  items,
  onSelect,
}: {
  items: LiveItemView[];
  onSelect: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="done-h" className="mx-3 mt-[22px]">
      <h2 id="done-h" className="section-label mx-2 mb-2.5">
        Done
      </h2>
      <div className="card-group">
        {items.map((it) => {
          const { text, pr } = completedSummary(it);
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onSelect(it.key)}
              aria-label={`${it.exercise.name}, done: ${text}${pr ? ", top set PR" : ""}. Open`}
              className={row}
            >
              <span className="w-6 h-6 rounded-full bg-[rgba(198,61,34,.14)] text-accent flex items-center justify-center shrink-0">
                <CheckIcon size={13} />
              </span>
              <span className="flex-1 text-muted truncate">{it.exercise.name}</span>
              {pr && <span className="num text-[15px] text-info">PR ↑</span>}
              <span className={cn("text-[13px] whitespace-nowrap", pr ? "text-fg-2" : "text-faint")}>{text}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function UpNextList({
  items,
  positions,
  onSelect,
}: {
  items: LiveItemView[];
  /** 1-based position of each item in the session. */
  positions: Map<string, number>;
  onSelect: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="up-h" className="mx-3 mt-[22px]">
      <h2 id="up-h" className="section-label mx-2 mb-2.5">
        Up next
      </h2>
      <div className="card-group">
        {items.map((it) => {
          const timed = it.exercise.loadMode === "TIME";
          const load = timed ? plannedMinutes(it)?.total ?? null : openKg(it) ?? it.lastTopKg;
          return (
            <button key={it.key} type="button" onClick={() => onSelect(it.key)} className={row}>
              <span className="num w-4 text-faint text-[15px]">{positions.get(it.key)}</span>
              <span className="flex-1 min-w-0 truncate">
                {it.exercise.name}
                {it.straps && <StrapsChip />}
              </span>
              {load != null && (
                <span className="num text-[18px] text-fg-2">
                  {formatKg(load)}
                  {timed && <span className="text-[13px] text-muted"> min</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
