"use client";

import { useState } from "react";
import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import { EXERCISE_CATEGORIES, STATUS_CONFIG } from "@/lib/constants";
import type { Exercise } from "@/lib/types";

interface ExerciseListProps {
  exercises: Exercise[];
}

export default function ExerciseList({ exercises }: ExerciseListProps) {
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(EXERCISE_CATEGORIES)
  );

  const filtered = search.trim()
    ? exercises.filter((e) =>
        e.name.toLowerCase().includes(search.toLowerCase())
      )
    : exercises;

  const grouped = EXERCISE_CATEGORIES.map((cat) => ({
    category: cat,
    exercises: filtered.filter((e) => e.category === cat),
  })).filter((g) => g.exercises.length > 0);

  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  return (
    <div>
      {/* Search */}
      <div className="relative mb-5">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises..."
          className="input-base pl-9"
        />
      </div>

      {/* Categories */}
      <div className="space-y-2">
        {grouped.map(({ category, exercises: exs }, catIndex) => {
          const isExpanded = expandedCategories.has(category);
          return (
            <div
              key={category}
              className="card !p-0 overflow-hidden animate-slide-up"
              style={{ animationDelay: `${catIndex * 40}ms` }}
            >
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <div>
                  <span className="font-semibold text-sm text-stone-200">
                    {category}
                  </span>
                  <span className="text-xs text-stone-500 ml-2">
                    ({exs.length})
                  </span>
                </div>
                <ChevronDownIcon
                  className={cn(
                    "w-4 h-4 text-stone-500 transition-transform",
                    isExpanded && "rotate-180"
                  )}
                />
              </button>

              {isExpanded && (
                <div className="border-t border-stone-800/60">
                  {exs.map((exercise) => {
                    const status = STATUS_CONFIG[exercise.status];
                    return (
                      <div
                        key={exercise.id}
                        className="flex items-center justify-between px-4 py-2.5 border-b border-stone-800/30 last:border-0"
                      >
                        <span
                          className={cn(
                            "text-sm",
                            exercise.status === "NO"
                              ? "text-stone-500"
                              : "text-stone-300"
                          )}
                        >
                          {exercise.name}
                          {exercise.isCustom && (
                            <span className="text-xs text-stone-600 ml-1.5">
                              (custom)
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full",
                            status.badgeClass
                          )}
                        >
                          {status.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-stone-500 text-sm py-8">
          No exercises found.
        </p>
      )}
    </div>
  );
}
