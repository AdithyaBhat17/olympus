"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatKg } from "@/domain/load";
import { deleteSession } from "@/lib/actions";
import { cn } from "@/lib/utils";

export interface HistorySet {
  reps: number;
  weight: number;
  rpe: number | null;
  warmup: boolean;
  underloaded: boolean;
}

export interface HistorySession {
  id: string;
  date: string;
  /** "Fri 2 Oct · W3 · B1", formatted on the server. */
  eyebrow: string;
  sessionName: string;
  sessionType: string | null;
  weekNumber: number;
  blockNumber: string;
  notes: string | null;
  status: "IN_PROGRESS" | "DONE";
  sent: boolean;
  exercises: Array<{ id: string; name: string; notes: string | null; sets: HistorySet[] }>;
}

interface HistoryListProps {
  sessions: HistorySession[];
  sessionNames: string[];
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("text-muted shrink-0 transition-transform", open && "rotate-180")}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function workingSetCount(s: HistorySession): number {
  return s.exercises.reduce((n, e) => n + e.sets.filter((x) => !x.warmup).length, 0);
}

export default function HistoryList({ sessions, sessionNames }: HistoryListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterName, setFilterName] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const filterId = useId();
  const router = useRouter();

  const filtered = filterName ? sessions.filter((s) => s.sessionName === filterName) : sessions;

  async function handleDelete(sessionId: string) {
    if (!window.confirm("Delete this session? This cannot be undone.")) return;
    setDeleting(sessionId);
    try {
      await deleteSession(sessionId);
      toast.success("Session deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete session");
    } finally {
      setDeleting(null);
    }
  }

  if (sessions.length === 0) {
    return (
      <div className="mx-4 mt-6 card flex flex-col gap-2">
        <p className="font-semibold">No sessions logged yet</p>
        <p className="text-sm text-muted leading-[1.45]">
          Start today&apos;s session from Today, or add an old one by hand.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Link href="/today" className="btn-secondary">
            Go to Today
          </Link>
          <Link href="/log" className="btn-secondary">
            Log manually
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {sessionNames.length > 1 && (
        <div className="px-4 pt-3 pb-1 flex items-center gap-3">
          <label htmlFor={filterId} className="eyebrow shrink-0">
            Show
          </label>
          <select
            id={filterId}
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            className="select-base h-11 py-0 text-[15px]"
          >
            <option value="">All sessions</option>
            {sessionNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="px-5 py-10 text-sm text-muted text-center">No sessions with that name.</p>
      ) : (
        <ul className="flex flex-col gap-2 px-4 pt-3">
          {filtered.map((s) => {
            const live = s.status === "IN_PROGRESS";
            const open = expandedId === s.id;
            const eyebrow = s.eyebrow;
            const sets = workingSetCount(s);
            const summary = `${s.exercises.length} ${s.exercises.length === 1 ? "exercise" : "exercises"} · ${sets} working ${sets === 1 ? "set" : "sets"}`;
            const panelId = `history-${s.id}`;

            if (live) {
              return (
                <li key={s.id}>
                  <Link
                    href={`/session/${s.id}`}
                    className="block rounded-2xl bg-surface border border-accent-line p-4 hover:bg-surface-2"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <span className="eyebrow font-normal">{eyebrow}</span>
                        <span className="font-display font-bold text-2xl leading-tight truncate">{s.sessionName}</span>
                        <span className="text-sm text-muted">{summary}</span>
                      </div>
                      <span className="shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-accent text-accent-ink text-xs font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-ink" aria-hidden="true" />
                        Live
                      </span>
                    </div>
                    <span className="mt-3 flex items-center gap-1 text-sm font-medium text-accent">
                      Resume session
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </span>
                  </Link>
                </li>
              );
            }

            return (
              <li key={s.id} className="rounded-2xl bg-surface">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setExpandedId(open ? null : s.id)}
                  className="w-full flex items-start gap-3 p-4 text-left rounded-2xl"
                >
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className="eyebrow font-normal">{eyebrow}</span>
                    <span className="font-display font-bold text-2xl leading-tight truncate">{s.sessionName}</span>
                    <span className="flex items-center gap-2 flex-wrap text-sm text-muted">
                      {summary}
                      {s.sent && (
                        <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-info-line text-info text-xs font-medium">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                          </svg>
                          Sent to PT
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="mt-1">
                    <Chevron open={open} />
                  </span>
                </button>

                {open && (
                  <div id={panelId} className="px-4 pb-4 flex flex-col animate-fade-in">
                    <ul className="flex flex-col border-t border-line-soft">
                      {s.exercises.map((e) => {
                        const rpes = e.sets.map((x) => x.rpe).filter((r): r is number => r != null);
                        return (
                          <li key={e.id} className="py-3 border-b border-line-soft flex flex-col gap-2">
                            <div className="flex justify-between gap-3">
                              <span className="font-semibold min-w-0">{e.name}</span>
                              {rpes.length > 0 && (
                                <span className="text-[13px] text-muted shrink-0">RPE {formatKg(Math.max(...rpes))}</span>
                              )}
                            </div>
                            <ul className="flex flex-wrap gap-2" aria-label={`${e.name} sets`}>
                              {e.sets.map((x, i) => (
                                <li
                                  key={i}
                                  className={cn(
                                    "px-2.5 py-1 rounded-lg bg-surface-2 font-display text-lg leading-tight tabular-nums",
                                    x.warmup && "text-muted",
                                    x.underloaded && "text-danger-soft"
                                  )}
                                >
                                  {formatKg(x.weight)} × {x.reps}
                                  {x.warmup && <span className="sr-only"> (warm-up)</span>}
                                  {x.underloaded && <span className="sr-only"> (underloaded)</span>}
                                </li>
                              ))}
                            </ul>
                            {e.notes && <p className="text-[13px] text-muted">{e.notes}</p>}
                          </li>
                        );
                      })}
                    </ul>

                    {s.notes && <p className="mt-3 text-sm text-fg-2 leading-[1.45]">{s.notes}</p>}

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Link href={`/session/${s.id}/finish`} className="btn-ghost">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M22 2L11 13" />
                          <path d="M22 2l-7 20-4-9-9-4z" />
                        </svg>
                        {s.sent ? "Export" : "Export / send"}
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        disabled={deleting === s.id}
                        className="btn-ghost text-danger-soft hover:bg-danger-bg disabled:opacity-50"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                        </svg>
                        {deleting === s.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
