"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { EXERCISE_CATEGORIES, STATUS_CONFIG } from "@/lib/constants";
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
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setShowCategoryPicker(false);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search exercise..."
          className="input-base pl-9 text-sm"
        />
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-stone-900 border border-stone-800 rounded-xl max-h-64 overflow-y-auto z-50 shadow-xl shadow-black/30 animate-scale-in">
          {Object.entries(grouped).map(([category, exs]) => (
            <div key={category}>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500 bg-stone-900 sticky top-0">
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
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-stone-800 active:bg-stone-700 flex items-center justify-between gap-2 transition-colors"
                >
                  <span className="text-stone-200 truncate">
                    {exercise.name}
                  </span>
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      STATUS_CONFIG[exercise.status].dotClass
                    )}
                  />
                </button>
              ))}
            </div>
          ))}

          {query.trim() && !hasExactMatch && !showCategoryPicker && (
            <button
              type="button"
              onClick={() => setShowCategoryPicker(true)}
              className="w-full text-left px-3 py-3 text-sm text-amber-500 hover:bg-stone-800 border-t border-stone-800 font-medium transition-colors"
            >
              + Add &quot;{query.trim()}&quot; as custom exercise
            </button>
          )}

          {showCategoryPicker && (
            <div className="p-3 border-t border-stone-800">
              <p className="text-xs text-stone-500 mb-2">Pick a category:</p>
              <div className="space-y-1">
                {EXERCISE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleCreateCustom(cat)}
                    className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-stone-800 rounded-lg transition-colors"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && !query.trim() && (
            <p className="px-3 py-4 text-sm text-stone-500 text-center">
              No exercises found
            </p>
          )}
        </div>
      )}
    </div>
  );
}
