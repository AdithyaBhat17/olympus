"use client";

import { useState } from "react";
import { resolveFlagAction } from "@/lib/liftlog-actions";
import { useAction } from "@/components/session/use-action";

export interface FlagItem {
  id: string;
  text: string;
}

/** Carry-forward coach flags, numbered 01, 02… with a Done button each. */
export function FlagsList({ flags }: { flags: FlagItem[] }) {
  const { run, busy } = useAction();
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const visible = flags.filter((f) => !hidden.has(f.id));
  if (visible.length === 0) return null;

  const resolve = async (id: string) => {
    setHidden((h) => new Set(h).add(id));
    const res = await run(() => resolveFlagAction(id));
    if (!res.ok) {
      setHidden((h) => {
        const next = new Set(h);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <section aria-labelledby="flags-h" className="mx-5 mt-4 flex flex-col gap-2">
      <h2 id="flags-h" className="eyebrow m-0 mb-1">
        Carry-forward flags
      </h2>
      <ol className="m-0 p-0 list-none flex flex-col gap-2">
        {visible.map((f, i) => (
          <li key={f.id} className="flex gap-3 py-2 pl-4 pr-2 bg-surface rounded-xl items-center">
            <span aria-hidden className="font-display text-[22px] font-bold text-accent w-7 shrink-0 tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-sm leading-[1.4] grow py-1.5">{f.text}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void resolve(f.id)}
              aria-label={`Mark flag ${i + 1} done: ${f.text}`}
              className="h-11 px-3 rounded-[10px] border border-line text-[13px] text-muted hover:text-fg hover:bg-surface-2 shrink-0 disabled:opacity-50"
            >
              Done
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
