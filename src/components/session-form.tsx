"use client";

import { useState, useCallback } from "react";
import {
  PlusIcon,
  XMarkIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import ExerciseSearch from "./exercise-search";
import { cn, todayISO } from "@/lib/utils";
import { saveSession, getLastSessionByName } from "@/lib/actions";
import type {
  Exercise,
  SessionFormExercise,
  SessionFormSet,
} from "@/lib/types";

const RPE_VALUES = [
  "5",
  "5.5",
  "6",
  "6.5",
  "7",
  "7.5",
  "8",
  "8.5",
  "9",
  "9.5",
  "10",
];
const WEEKS = Array.from({ length: 12 }, (_, i) => i + 1);
const BLOCKS = ["1", "2", "3", "Deload"];
const DEFAULT_SET_COUNT = 3;

interface SessionFormProps {
  exercises: Exercise[];
  recentSessionNames: string[];
}

function makeEmptySet(): SessionFormSet {
  return { reps: "", weight: "" };
}

function makeEmptyExercise(): SessionFormExercise {
  return {
    id: crypto.randomUUID(),
    exercise_id: "",
    exercise_name: "",
    sets: Array.from({ length: DEFAULT_SET_COUNT }, makeEmptySet),
    rpe: "",
    notes: "",
  };
}

export default function SessionForm({
  exercises: initialExercises,
  recentSessionNames,
}: SessionFormProps) {
  const [date, setDate] = useState(todayISO());
  const [sessionName, setSessionName] = useState("");
  const [weekNumber, setWeekNumber] = useState("1");
  const [blockNumber, setBlockNumber] = useState("1");
  const [formExercises, setFormExercises] = useState<SessionFormExercise[]>([
    makeEmptyExercise(),
  ]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [availableExercises, setAvailableExercises] =
    useState<Exercise[]>(initialExercises);

  const canQuickFill =
    sessionName.trim() && recentSessionNames.includes(sessionName.trim());

  const updateExercise = useCallback(
    (id: string, updates: Partial<SessionFormExercise>) => {
      setFormExercises((prev) =>
        prev.map((ex) => (ex.id === id ? { ...ex, ...updates } : ex))
      );
    },
    []
  );

  const updateSet = useCallback(
    (exerciseId: string, setIndex: number, updates: Partial<SessionFormSet>) => {
      setFormExercises((prev) =>
        prev.map((ex) => {
          if (ex.id !== exerciseId) return ex;
          const nextSets = ex.sets.map((s, i) =>
            i === setIndex ? { ...s, ...updates } : s
          );
          return { ...ex, sets: nextSets };
        })
      );
    },
    []
  );

  const addSet = useCallback((exerciseId: string) => {
    setFormExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;
        // Pre-fill new set with the last set's values as a convenience.
        const last = ex.sets[ex.sets.length - 1];
        const seed: SessionFormSet = last
          ? { reps: last.reps, weight: last.weight }
          : makeEmptySet();
        return { ...ex, sets: [...ex.sets, seed] };
      })
    );
  }, []);

  const removeSet = useCallback((exerciseId: string, setIndex: number) => {
    setFormExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;
        if (ex.sets.length <= 1) return ex;
        return { ...ex, sets: ex.sets.filter((_, i) => i !== setIndex) };
      })
    );
  }, []);

  const removeExercise = useCallback((id: string) => {
    setFormExercises((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((ex) => ex.id !== id);
    });
  }, []);

  async function handleQuickFill() {
    if (!sessionName.trim()) return;

    try {
      const last = await getLastSessionByName(sessionName.trim());
      if (!last || !last.sessionExercises.length) {
        toast.error("No previous session found");
        return;
      }

      setWeekNumber(last.weekNumber.toString());
      setBlockNumber(last.blockNumber);

      setFormExercises(
        last.sessionExercises.map((se) => {
          const fromDetails = se.setDetails?.map((s) => ({
            reps: s.reps.toString(),
            weight: s.weight.toString(),
          }));
          const sets: SessionFormSet[] =
            fromDetails && fromDetails.length > 0
              ? fromDetails
              : Array.from({ length: se.sets }, () => ({
                  reps: se.reps.toString(),
                  weight: parseFloat(se.weight).toString(),
                }));
          return {
            id: crypto.randomUUID(),
            exercise_id: se.exerciseId,
            exercise_name: se.exercise.name,
            sets,
            rpe: se.rpe ? parseFloat(se.rpe).toString() : "",
            notes: se.notes || "",
          };
        })
      );

      toast.success(`Filled from last "${last.sessionName}"`);
    } catch {
      toast.error("Failed to load previous session");
    }
  }

  async function handleSave() {
    if (!sessionName.trim()) {
      toast.error("Enter a session name");
      return;
    }

    const parsedExercises: Array<{
      exerciseId: string;
      sets: Array<{ reps: number; weight: number }>;
      rpe: number | null;
      notes: string | null;
      orderIndex: number;
    }> = [];

    for (let i = 0; i < formExercises.length; i++) {
      const ex = formExercises[i];
      if (!ex.exercise_id) continue;

      const validSets: Array<{ reps: number; weight: number }> = [];
      for (let j = 0; j < ex.sets.length; j++) {
        const s = ex.sets[j];
        if (!s.reps.trim() && !s.weight.trim()) continue; // skip blank rows
        const reps = parseInt(s.reps, 10);
        const weight = parseFloat(s.weight);
        if (isNaN(reps) || reps < 1) {
          toast.error(
            `Invalid reps for ${ex.exercise_name || "exercise"} (set ${j + 1})`
          );
          return;
        }
        if (isNaN(weight) || weight < 0) {
          toast.error(
            `Invalid weight for ${ex.exercise_name || "exercise"} (set ${j + 1})`
          );
          return;
        }
        validSets.push({ reps, weight });
      }

      if (validSets.length === 0) continue;

      parsedExercises.push({
        exerciseId: ex.exercise_id,
        sets: validSets,
        rpe: ex.rpe ? parseFloat(ex.rpe) : null,
        notes: ex.notes.trim() || null,
        orderIndex: parsedExercises.length,
      });
    }

    if (parsedExercises.length === 0) {
      toast.error("Add at least one exercise with sets");
      return;
    }

    setSaving(true);

    try {
      await saveSession({
        date,
        sessionName: sessionName.trim(),
        weekNumber: parseInt(weekNumber),
        blockNumber: blockNumber as "1" | "2" | "3" | "Deload",
        notes: notes.trim() || null,
        exercises: parsedExercises,
      });

      toast.success("Session saved!");

      // Reset form
      setFormExercises([makeEmptyExercise()]);
      setNotes("");
      setSessionName("");
    } catch {
      toast.error("Failed to save session");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="py-6 space-y-5">
      {/* Header */}
      <h2 className="text-2xl font-black tracking-tight">NEW SESSION</h2>

      {/* Session info */}
      <div className="card space-y-3">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input-base"
        />

        <div className="relative">
          <input
            type="text"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            list="session-names"
            placeholder="Session name (e.g. Upper A — Push)"
            className="input-base"
          />
          <datalist id="session-names">
            {recentSessionNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        {canQuickFill && (
          <button
            type="button"
            onClick={handleQuickFill}
            className="btn-secondary flex items-center justify-center gap-2 text-sm text-amber-500 border-amber-500/30 hover:border-amber-500/50"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Fill from last &quot;{sessionName}&quot;
          </button>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1 block">
              Week
            </label>
            <select
              value={weekNumber}
              onChange={(e) => setWeekNumber(e.target.value)}
              className="select-base"
            >
              {WEEKS.map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1 block">
              Block
            </label>
            <select
              value={blockNumber}
              onChange={(e) => setBlockNumber(e.target.value)}
              className="select-base"
            >
              {BLOCKS.map((b) => (
                <option key={b} value={b}>
                  {b === "Deload" ? "Deload" : `Block ${b}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Exercises */}
      <div>
        <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
          Exercises
        </h3>

        <div className="space-y-3">
          {formExercises.map((ex, index) => (
            <div
              key={ex.id}
              className="card animate-slide-up"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              {/* Exercise name + delete */}
              <div className="flex gap-2 items-start mb-3">
                <div className="flex-1">
                  <ExerciseSearch
                    exercises={availableExercises}
                    value={ex.exercise_name}
                    onSelect={(selected) =>
                      updateExercise(ex.id, {
                        exercise_id: selected.id,
                        exercise_name: selected.name,
                      })
                    }
                    onExerciseCreated={(newEx) =>
                      setAvailableExercises((prev) => [...prev, newEx])
                    }
                  />
                </div>
                {formExercises.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeExercise(ex.id)}
                    className="p-2 text-stone-600 hover:text-red-400 transition-colors mt-1"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Per-set rows */}
              <div className="space-y-2">
                <div className="grid grid-cols-[2rem_1fr_1fr_1.75rem] gap-2 items-center">
                  <span className="text-[10px] font-semibold text-stone-600 uppercase">
                    Set
                  </span>
                  <span className="text-[10px] font-semibold text-stone-600 uppercase text-center">
                    Reps
                  </span>
                  <span className="text-[10px] font-semibold text-stone-600 uppercase text-center">
                    Weight (kg)
                  </span>
                  <span />
                </div>

                {ex.sets.map((s, setIdx) => (
                  <div
                    key={setIdx}
                    className="grid grid-cols-[2rem_1fr_1fr_1.75rem] gap-2 items-center"
                  >
                    <span className="text-xs font-semibold text-stone-500 text-center">
                      {setIdx + 1}
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={s.reps}
                      onChange={(e) =>
                        updateSet(ex.id, setIdx, { reps: e.target.value })
                      }
                      placeholder="8"
                      className="input-base text-sm text-center"
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.5}
                      value={s.weight}
                      onChange={(e) =>
                        updateSet(ex.id, setIdx, { weight: e.target.value })
                      }
                      placeholder="0"
                      className="input-base text-sm text-center"
                    />
                    <button
                      type="button"
                      onClick={() => removeSet(ex.id, setIdx)}
                      disabled={ex.sets.length <= 1}
                      className={cn(
                        "p-1 text-stone-600 hover:text-red-400 transition-colors",
                        ex.sets.length <= 1 && "opacity-30 cursor-not-allowed"
                      )}
                      aria-label={`Remove set ${setIdx + 1}`}
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addSet(ex.id)}
                  className="btn-secondary flex items-center justify-center gap-1.5 text-xs py-1.5 mt-1"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  Add Set
                </button>
              </div>

              {/* RPE */}
              <div className="mt-3">
                <label className="text-[10px] font-semibold text-stone-600 uppercase mb-1 block">
                  RPE
                </label>
                <select
                  value={ex.rpe}
                  onChange={(e) =>
                    updateExercise(ex.id, { rpe: e.target.value })
                  }
                  className="select-base text-sm"
                >
                  <option value="">—</option>
                  {RPE_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <input
                type="text"
                value={ex.notes}
                onChange={(e) =>
                  updateExercise(ex.id, { notes: e.target.value })
                }
                placeholder="Notes (optional)"
                className="input-base text-sm mt-2 text-stone-400"
              />
            </div>
          ))}
        </div>

        {/* Add exercise button */}
        <button
          type="button"
          onClick={() =>
            setFormExercises((prev) => [...prev, makeEmptyExercise()])
          }
          className="btn-secondary flex items-center justify-center gap-2 mt-3 text-sm"
        >
          <PlusIcon className="w-4 h-4" />
          Add Exercise
        </button>
      </div>

      {/* Session notes */}
      <div>
        <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
          Session Notes
        </h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="How did it feel? Energy, sleep, anything notable..."
          rows={3}
          className="input-base resize-none"
        />
      </div>

      {/* Save */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className={cn("btn-primary text-lg font-bold", saving && "opacity-60")}
      >
        {saving ? "Saving..." : "Save Session"}
      </button>
    </div>
  );
}
