"use client";

import { formatKg } from "@/domain/load";
import type { UnderloadNudge as Nudge } from "@/domain/progression";
import { ArrowUpIcon } from "./icons";

interface UnderloadNudgeProps {
  nudge: Nudge;
  nextSetLabel: string | null;
  currentKg: number;
  onAccept: () => void;
  onKeep: () => void;
}

export function UnderloadNudge({ nudge, nextSetLabel, currentKg, onAccept, onKeep }: UnderloadNudgeProps) {
  return (
    <div
      role="status"
      className="mt-0.5 mb-1 px-3.5 py-3 rounded-[16px] bg-accent-bg ring-1 ring-inset ring-accent-line flex gap-2.5 items-start animate-slide-up"
    >
      <ArrowUpIcon className="shrink-0 mt-0.5 text-accent" />
      <div className="flex flex-col gap-2 grow">
        <span className="text-sm leading-[1.4]">
          <strong className="font-semibold">{nudge.headline}</strong> {nudge.detail}
        </span>
        <div className="flex gap-2 flex-wrap">
          {nextSetLabel && (
            <button
              type="button"
              onClick={onAccept}
              className="min-h-11 px-3.5 rounded-[14px] bg-accent text-accent-ink font-semibold text-sm"
            >
              Set {nextSetLabel} at {formatKg(nudge.suggestKg)} kg
            </button>
          )}
          <button
            type="button"
            onClick={onKeep}
            className="min-h-11 px-3.5 rounded-[14px] bg-surface-2 text-fg-2 text-sm"
          >
            Keep {formatKg(currentKg)}
          </button>
        </div>
      </div>
    </div>
  );
}
