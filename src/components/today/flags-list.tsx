"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { mutate } from "@/lib/offline/mutate";
import { hapticTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export interface FlagItem {
  id: string;
  text: string;
}

const UNDO_MS = 4000;

/**
 * Carry-forward coach flags, numbered 01, 02… Done slides the row out
 * (220 ms), collapses it, and offers Undo for 4 s before the resolve is sent.
 */
export function FlagsList({ flags }: { flags: FlagItem[] }) {
  // "leaving" = sliding out; "gone" = collapsed and pending/resolved.
  const [state, setState] = useState<Record<string, "leaving" | "gone">>({});
  const timers = useRef<Map<string, number>>(new Map());

  const commit = (id: string) => {
    timers.current.delete(id);
    void mutate({ kind: "resolveFlag", id }, {
      rollback: () =>
        setState((s) => {
          const next = { ...s };
          delete next[id];
          return next;
        }),
    });
  };

  // Don't lose a pending resolve if the app is closed inside the undo window.
  useEffect(() => {
    const t = timers.current;
    const flushAll = () => {
      for (const [id, handle] of t) {
        window.clearTimeout(handle);
        commit(id);
      }
    };
    window.addEventListener("pagehide", flushAll);
    return () => {
      window.removeEventListener("pagehide", flushAll);
      flushAll();
    };
  }, []);

  const done = (f: FlagItem) => {
    hapticTick();
    setState((s) => ({ ...s, [f.id]: "leaving" }));
    window.setTimeout(() => setState((s) => (s[f.id] ? { ...s, [f.id]: "gone" } : s)), 220);
    timers.current.set(f.id, window.setTimeout(() => commit(f.id), UNDO_MS));
    toast("Flag marked done", {
      id: `flag-${f.id}`,
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          const h = timers.current.get(f.id);
          if (h == null) return;
          window.clearTimeout(h);
          timers.current.delete(f.id);
          setState((s) => {
            const next = { ...s };
            delete next[f.id];
            return next;
          });
        },
      },
    });
  };

  const open = flags.filter((f) => state[f.id] == null);
  if (flags.length === 0 || flags.every((f) => state[f.id] === "gone")) return null;

  let n = 0;
  return (
    <section aria-labelledby="flags-h" className="arrive arrive-3 mx-3 mt-[22px]">
      <div className="flex justify-between items-baseline px-2 pb-2.5">
        <h2 id="flags-h" className="section-label m-0">
          Carry-forward from your PT
        </h2>
        <span className="num text-[15px] text-muted">{open.length}</span>
      </div>
      <ol className="m-0 p-0 list-none flex flex-col">
        {flags.map((f) => {
          const st = state[f.id];
          if (!st) n += 1;
          return (
            <li
              key={f.id}
              className={cn(
                "grid transition-[grid-template-rows,opacity,transform,margin] duration-[220ms] ease-[cubic-bezier(.4,0,.2,1)]",
                st ? "opacity-0 translate-x-10" : "opacity-100 mb-2",
                st === "gone" ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
              )}
              aria-hidden={st ? true : undefined}
            >
              <div className="overflow-hidden">
                <div className="flex items-center gap-3 py-1.5 pr-1.5 pl-4 rounded-[18px] bg-surface">
                  <span aria-hidden className="num text-[22px] text-accent w-[26px] shrink-0">
                    {st ? "" : String(n).padStart(2, "0")}
                  </span>
                  <span className="flex-1 text-sm leading-[1.4] text-[#3F302C] py-2">{f.text}</span>
                  <button
                    type="button"
                    disabled={!!st}
                    onClick={() => done(f)}
                    aria-label={`Mark done: ${f.text}`}
                    className="w-11 h-11 shrink-0 rounded-[14px] bg-surface-2 text-fg-2 flex items-center justify-center"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
