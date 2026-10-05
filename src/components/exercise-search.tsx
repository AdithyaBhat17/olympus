"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { EXERCISE_CATEGORIES } from "@/lib/constants";

const STATUS_DOT: Record<Exercise["status"], { cls: string; label: string }> = {
  YES: { cls: "bg-info", label: "Active" },
  SUB: { cls: "bg-accent", label: "Sub" },
  NO: { cls: "bg-danger", label: "Blocked" },
};
import type { Exercise } from "@/lib/types";
import { createCustomExercise } from "@/lib/actions";
import { toast } from "sonner";

interface ExerciseSearchProps {
  exercises: Exercise[];
  value: string;
  onSelect: (exercise: { id: string; name: string }) => void;
  onExerciseCreated?: (exercise: Exercise) => void;
}

export default function ExerciseSearch({
  exercises,
  value,
  onSelect,
  onExerciseCreated,
}: ExerciseSearchProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCategoryPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(
    () =>
      query.trim()
        ? exercises.filter((e) =>
            e.name.toLowerCase().includes(query.toLowerCase())
          )
        : exercises,
    [query, exercises]
  );

  const grouped = useMemo(
    () =>
      filtered.reduce(
        (acc, e) => {
          if (!acc[e.category]) acc[e.category] = [];
          acc[e.category].push(e);
          return acc;
        },
        {} as Record<string, Exercise[]>
      ),
    [filtered]
  );

  const hasExactMatch = useMemo(
    () =>
      exercises.some(
        (e) => e.name.toLowerCase() === query.trim().toLowerCase()
      ),
    [query, exercises]
  );

  async function handleCreateCustom(category: string) {
    try {
      const exercise = await createCustomExercise({
        name: query.trim(),
        category,
      });
      if (exercise) {
        onSelect({ id: exercise.id, name: exercise.name });
        onExerciseCreated?.(exercise as Exercise);
        setOpen(false);
        setShowCategoryPicker(false);
      }
    } catch {
      toast.error("Failed to create exercise");
    }
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setShowCategoryPicker(false);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search exercise…"
          aria-label="Exercise"
          className="input-base pl-9"
        />
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface-2 border border-line rounded-xl max-h-64 overflow-y-auto z-50 shadow-xl shadow-black/40 animate-scale-in">
          {Object.entries(grouped).map(([category, exs]) => (
            <div key={category}>
              <div className="px-3 py-1.5 text-[11px] font-semibold text-muted bg-surface-2 sticky top-0">
                {category}
              </div>
              {exs.map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  onClick={() => {
                    onSelect({ id: exercise.id, name: exercise.name });
                    setQuery(exercise.name);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 min-h-[44px] text-[15px] hover:bg-line active:bg-line-strong flex items-center justify-between gap-2 transition-colors"
                >
                  <span className="text-fg truncate">
                    {exercise.name}
                  </span>
                  <span
                    title={STATUS_DOT[exercise.status].label}
                    className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      STATUS_DOT[exercise.status].cls
                    )}
                  >
                    <span className="sr-only">{STATUS_DOT[exercise.status].label}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}

          {query.trim() && !hasExactMatch && !showCategoryPicker && (
            <button
              type="button"
              onClick={() => setShowCategoryPicker(true)}
              className="w-full text-left px-3 min-h-[44px] text-sm text-accent hover:bg-line border-t border-line font-medium transition-colors"
            >
              + Add &quot;{query.trim()}&quot; as custom exercise
            </button>
          )}

          {showCategoryPicker && (
            <div className="p-3 border-t border-line">
              <p className="text-xs text-muted mb-2">Pick a category:</p>
              <div className="space-y-1">
                {EXERCISE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleCreateCustom(cat)}
                    className="w-full text-left px-3 min-h-[44px] text-sm text-fg-2 hover:bg-line rounded-lg transition-colors"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && !query.trim() && (
            <p className="px-3 py-4 text-sm text-muted text-center">
              No exercises found
            </p>
          )}
        </div>
      )}
    </div>
  );
}
