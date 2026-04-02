"use client";

import { useState, useCallback } from "react";
import {
  PlusIcon,
  XMarkIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import ExerciseSearch from "./exercise-search";
import { cn, parseSetsReps, todayISO } from "@/lib/utils";
import { saveSession, getLastSessionByName } from "@/lib/actions";
import type { Exercise, SessionFormExercise } from "@/lib/types";

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

interface SessionFormProps {
  exercises: Exercise[];
  recentSessionNames: string[];
}

function makeEmptyExercise(): SessionFormExercise {
  return {
    id: crypto.randomUUID(),
    exercise_id: "",
    exercise_name: "",
    sets_reps: "",
    weight: "",
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
      last.sessionExercises.map((se) => ({
        id: crypto.randomUUID(),
        exercise_id: se.exerciseId,
        exercise_name: se.exercise.name,
        sets_reps: `${se.sets}x${se.reps}`,
        weight: parseFloat(se.weight).toString(),
        rpe: se.rpe ? parseFloat(se.rpe).toString() : "",
        notes: se.notes || "",
      }))
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

    const validExercises = formExercises.filter(
      (ex) => ex.exercise_id && ex.sets_reps && ex.weight
    );

    if (validExercises.length === 0) {
      toast.error("Add at least one exercise");
      return;
    }

    const parsedExercises: Array<{
      exerciseId: string;
      sets: number;
      reps: number;
      weight: number;
      rpe: number | null;
      notes: string | null;
      orderIndex: number;
    }> = [];

    for (let i = 0; i < validExercises.length; i++) {
      const ex = validExercises[i];
      const parsed = parseSetsReps(ex.sets_reps);
      if (!parsed) {
        toast.error(`Invalid sets x reps: "${ex.sets_reps}" — use format 4x8`);
        return;
      }
      const weight = parseFloat(ex.weight);
      if (isNaN(weight) || weight < 0) {
        toast.error(`Invalid weight for ${ex.exercise_name}`);
        return;
      }
      parsedExercises.push({
        exerciseId: ex.exercise_id,
        sets: parsed.sets,
        reps: parsed.reps,
        weight,
        rpe: ex.rpe ? parseFloat(ex.rpe) : null,
        notes: ex.notes.trim() || null,
        orderIndex: i,
      });
    }

    setSaving(true);

    try {
      await saveSession({
        date,
        sessionName: sessionName.trim(),
        weekNumber: parseInt(weekNumber),
        blockNumber,
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

              {/* Sets × Reps, Weight, RPE */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-stone-600 uppercase mb-1 block">
                    Sets × Reps
                  </label>
                  <input
                    type="text"
                    value={ex.sets_reps}
                    onChange={(e) =>
                      updateExercise(ex.id, { sets_reps: e.target.value })
                    }
                    placeholder="4x8"
                    className="input-base text-sm text-center"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-stone-600 uppercase mb-1 block">
                    Weight (kg)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={ex.weight}
                    onChange={(e) =>
                      updateExercise(ex.id, { weight: e.target.value })
                    }
                    placeholder="0"
                    className="input-base text-sm text-center"
                  />
                </div>
                <div>
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
