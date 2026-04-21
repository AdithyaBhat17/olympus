"use client";

import { useState } from "react";
import {
  ChevronDownIcon,
  FunnelIcon,
  TrashIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import { cn, formatDate } from "@/lib/utils";
import { deleteSession } from "@/lib/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface SetDetail {
  reps: number;
  weight: number;
}

interface SessionData {
  id: string;
  date: string;
  sessionName: string;
  weekNumber: number;
  blockNumber: string;
  notes: string | null;
  sessionExercises: Array<{
    id: string;
    sets: number;
    reps: number;
    weight: string;
    setDetails: SetDetail[] | null;
    rpe: string | null;
    notes: string | null;
    orderIndex: number;
    exercise: {
      id: string;
      name: string;
    };
  }>;
}

function resolveSets(se: SessionData["sessionExercises"][number]): SetDetail[] {
  if (se.setDetails && se.setDetails.length > 0) return se.setDetails;
  // Legacy rows: synthesize uniform sets from aggregate columns.
  return Array.from({ length: se.sets }, () => ({
    reps: se.reps,
    weight: parseFloat(se.weight),
  }));
}

function isUniform(sets: SetDetail[]): boolean {
  if (sets.length <= 1) return true;
  const [first] = sets;
  return sets.every((s) => s.reps === first.reps && s.weight === first.weight);
}

function formatSetsShort(sets: SetDetail[]): string {
  if (sets.length === 0) return "";
  if (isUniform(sets)) {
    const [first] = sets;
    return `${sets.length}x${first.reps} @ ${first.weight}kg`;
  }
  return sets.map((s) => `${s.reps}@${s.weight}kg`).join(" · ");
}

interface HistoryListProps {
  sessions: SessionData[];
  sessionNames: string[];
}

export default function HistoryList({
  sessions,
  sessionNames,
}: HistoryListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterName, setFilterName] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const router = useRouter();

  function formatForClaude(s: SessionData) {
    const dateStr = new Date(s.date).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const sorted = [...s.sessionExercises].sort(
      (a, b) => a.orderIndex - b.orderIndex
    );

    const header = `[${dateStr}] — ${s.sessionName}\nWeek ${s.weekNumber} | Block ${s.blockNumber}\n`;
    const colHeader = `Exercise          | Sets (reps @ kg)                | RPE | Notes\n------------------------------------------------------------------`;

    const rows = sorted
      .map((se) => {
        const setsList = resolveSets(se);
        const name = se.exercise.name.padEnd(18);
        const setsStr = formatSetsShort(setsList).padEnd(32);
        const rpe = se.rpe ? `${parseFloat(se.rpe)}`.padEnd(4) : "    ";
        const notes = se.notes || "";
        return `${name}| ${setsStr}| ${rpe}| ${notes}`;
      })
      .join("\n");

    const sessionNotes = s.notes
      ? `\nSession notes: ${s.notes}`
      : "";

    return `${header}\n${colHeader}\n${rows}${sessionNotes}`;
  }

  async function handleCopy(s: SessionData) {
    try {
      const text = formatForClaude(s);
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }

  const filtered = filterName
    ? sessions.filter((s) => s.sessionName === filterName)
    : sessions;

  async function handleDelete(sessionId: string) {
    if (!window.confirm("Delete this session? This cannot be undone.")) return;
    try {
      await deleteSession(sessionId);
      toast.success("Session deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete session");
    }
  }

  return (
    <div>
      {/* Filters */}
      <button
        type="button"
        onClick={() => setShowFilters(!showFilters)}
        className="flex items-center gap-2 text-sm text-stone-400 hover:text-stone-200 mb-4 transition-colors"
      >
        <FunnelIcon className="w-4 h-4" />
        {showFilters ? "Hide filters" : "Filter"}
      </button>

      {showFilters && (
        <div className="card mb-4 animate-slide-up">
          <label className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-1 block">
            Session Name
          </label>
          <select
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            className="select-base text-sm"
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

      {/* Sessions */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-stone-500 text-sm">No sessions logged yet.</p>
          <p className="text-stone-600 text-xs mt-1">
            Head to the Log tab to start.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s, i) => {
            const isExpanded = expandedId === s.id;
            return (
              <div
                key={s.id}
                className="card animate-slide-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {/* Summary row */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : s.id)
                  }
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-stone-100 truncate">
                      {s.sessionName}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-stone-500">
                        {formatDate(s.date)}
                      </span>
                      <span className="text-stone-700">·</span>
                      <span className="text-xs text-stone-500">
                        W{s.weekNumber} B{s.blockNumber}
                      </span>
                      <span className="text-stone-700">·</span>
                      <span className="text-xs text-stone-500">
                        {s.sessionExercises.length} exercises
                      </span>
                    </div>
                  </div>
                  <ChevronDownIcon
                    className={cn(
                      "w-5 h-5 text-stone-500 transition-transform shrink-0 ml-2",
                      isExpanded && "rotate-180"
                    )}
                  />
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-stone-800 space-y-3 animate-fade-in">
                    {[...s.sessionExercises]
                      .sort((a, b) => a.orderIndex - b.orderIndex)
                      .map((se) => {
                        const setsList = resolveSets(se);
                        const uniform = isUniform(setsList);
                        return (
                          <div key={se.id} className="space-y-1">
                            <div className="flex items-baseline justify-between gap-4">
                              <span className="text-sm text-stone-300 truncate min-w-0">
                                {se.exercise.name}
                              </span>
                              {uniform && setsList[0] && (
                                <div className="flex items-baseline gap-3 shrink-0 text-sm">
                                  <span className="text-stone-400">
                                    {setsList.length}x{setsList[0].reps}
                                  </span>
                                  <span className="text-stone-200 font-medium">
                                    {setsList[0].weight}kg
                                  </span>
                                  {se.rpe && (
                                    <span className="text-amber-500/80 text-xs">
                                      @{parseFloat(se.rpe)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            {!uniform && (
                              <div className="flex flex-wrap gap-x-3 gap-y-1 pl-2 text-xs">
                                {setsList.map((set, i) => (
                                  <span key={i} className="text-stone-400">
                                    <span className="text-stone-600">
                                      {i + 1}.
                                    </span>{" "}
                                    <span className="text-stone-300">
                                      {set.reps}
                                    </span>
                                    <span className="text-stone-600">×</span>
                                    <span className="text-stone-200 font-medium">
                                      {set.weight}kg
                                    </span>
                                  </span>
                                ))}
                                {se.rpe && (
                                  <span className="text-amber-500/80">
                                    @{parseFloat(se.rpe)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                    {s.notes && (
                      <p className="text-xs text-stone-500 mt-3 italic">
                        {s.notes}
                      </p>
                    )}

                    <div className="flex items-center gap-4 mt-2 pt-2 border-t border-stone-800/50">
                      <button
                        type="button"
                        onClick={() => handleCopy(s)}
                        className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-amber-500 transition-colors"
                      >
                        <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                        Copy for Claude
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        className="flex items-center gap-1.5 text-xs text-stone-600 hover:text-red-400 transition-colors"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
