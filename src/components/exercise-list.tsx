"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EXERCISE_CATEGORIES } from "@/lib/constants";
import { createCustomExercise } from "@/lib/actions";
import { setCarriageAction } from "@/lib/liftlog-actions";
import { formatKg } from "@/domain/load";
import type { LoadMode } from "@/domain/types";

export interface LibraryExercise {
  id: string;
  name: string;
  category: string;
  status: "YES" | "SUB" | "NO";
  isCustom: boolean;
  loadMode: LoadMode;
  carriageKgPerSide: number | null;
  blocked: boolean;
  blockedReason: string | null;
  substitutes: string[];
}

interface ExerciseListProps {
  exercises: LibraryExercise[];
}

function StatusPill({ ex }: { ex: LibraryExercise }) {
  const [label, cls] = ex.blocked
    ? ["Blocked", "bg-danger-bg border-danger-line text-danger-text"]
    : ex.status === "SUB"
      ? ["Sub", "bg-accent-bg border-accent-line text-accent-soft"]
      : ["Active", "bg-surface-2 border-line text-muted"];
  return (
    <span className={cn("shrink-0 text-xs font-medium rounded-full border px-2 py-0.5", cls)}>{label}</span>
  );
}

function ModeBadge({ mode }: { mode: LoadMode }) {
  if (mode === "TOTAL") return null;
  return (
    <span className="chip border-info-line text-info whitespace-nowrap">
      {mode === "PER_SIDE" ? "per side" : "counterweight"}
    </span>
  );
}

export default function ExerciseList({ exercises }: ExerciseListProps) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const searchId = useId();

  const filtered = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return exercises;
    return exercises.filter((e) => {
      const hay = `${e.name} ${e.category}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [exercises, search]);

  const grouped = useMemo(() => {
    const known = EXERCISE_CATEGORIES as readonly string[];
    const cats = [...known, ...Array.from(new Set(filtered.map((e) => e.category))).filter((c) => !known.includes(c))];
    return cats
      .map((category) => ({ category, exercises: filtered.filter((e) => e.category === category) }))
      .filter((g) => g.exercises.length > 0);
  }, [filtered]);

  const searching = search.trim().length > 0;

  function toggle(cat: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-4 flex flex-col gap-2">
        <label
          htmlFor={searchId}
          className="flex items-center gap-2.5 h-12 px-3.5 rounded-xl bg-surface border border-line focus-within:border-accent"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="text-muted shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span className="sr-only">Search exercises</span>
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exercises"
            className="flex-1 min-w-0 bg-transparent text-[16px] text-fg placeholder:text-faint outline-none"
          />
        </label>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="self-start min-h-[44px] text-sm text-accent hover:text-accent-hover flex items-center gap-1.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {searching && filtered.length === 0 ? `Add “${search.trim()}” as a custom exercise` : "New custom exercise"}
          </button>
        )}
        {creating && <CreateExercise initialName={search.trim()} onDone={() => setCreating(false)} />}
      </div>

      {grouped.length === 0 && (
        <p className="px-5 py-8 text-sm text-muted text-center">No exercises match “{search.trim()}”.</p>
      )}

      {grouped.map(({ category, exercises: exs }) => {
        const open = searching || !collapsed.has(category);
        const panelId = `lib-${category.replace(/[^a-z0-9]+/gi, "-")}`;
        return (
          <section key={category} className="px-4 mt-4">
            <h2>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(category)}
                disabled={searching}
                className="w-full min-h-[44px] flex items-center justify-between gap-3 text-left"
              >
                <span className="eyebrow">
                  {category} <span className="font-normal text-faint normal-case tracking-normal">· {exs.length}</span>
                </span>
                {!searching && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn("text-muted transition-transform", open && "rotate-180")}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                )}
              </button>
            </h2>
            {open && (
              <ul id={panelId} className="flex flex-col gap-2">
                {exs.map((ex) => (
                  <ExerciseRow key={ex.id} ex={ex} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ExerciseRow({ ex }: { ex: LibraryExercise }) {
  return (
    <li
      className={cn(
        "rounded-[14px] p-3.5 flex flex-col gap-1.5",
        ex.blocked ? "bg-surface-sunk border border-line-soft" : "bg-surface"
      )}
    >
      <div className="flex items-start gap-3">
        {ex.blocked && (
          <span className="mt-px w-6 h-6 rounded-full bg-danger-dot flex items-center justify-center shrink-0" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-danger-soft">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </span>
        )}
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("font-semibold", ex.blocked && "text-fg-2")}>{ex.name}</span>
          {ex.isCustom && <span className="chip border-line text-muted">custom</span>}
          <ModeBadge mode={ex.loadMode} />
        </div>
        <StatusPill ex={ex} />
      </div>
      {ex.blocked && ex.blockedReason && (
        <p className={cn("text-[13px] text-danger-text leading-[1.4]", ex.blocked && "pl-9")}>{ex.blockedReason}</p>
      )}
      {ex.blocked && ex.substitutes.length > 0 && (
        <p className="pl-9 text-[13px] text-info">Use instead → {ex.substitutes.join(", ")}</p>
      )}
      {ex.loadMode === "PER_SIDE" && <CarriageEditor ex={ex} />}
    </li>
  );
}

function CarriageEditor({ ex }: { ex: LibraryExercise }) {
  const router = useRouter();
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(ex.carriageKgPerSide != null ? String(ex.carriageKgPerSide) : "");
  const [pending, startTransition] = useTransition();

  function save() {
    const raw = value.trim().replace(",", ".");
    const kg = raw === "" ? null : parseFloat(raw);
    if (kg != null && (!Number.isFinite(kg) || kg < 0 || kg > 100)) {
      toast.error("Carriage must be between 0 and 100 kg");
      return;
    }
    startTransition(async () => {
      const res = await setCarriageAction(ex.id, kg);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(kg == null ? `${ex.name}: carriage cleared` : `${ex.name}: carriage ${formatKg(kg)} kg/side`);
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className={cn("flex items-center justify-between gap-3", ex.blocked && "pl-9")}>
        <span className="text-[13px] text-muted">
          Carriage{" "}
          <span className="font-display text-base font-semibold text-fg-2 tabular-nums">
            {ex.carriageKgPerSide != null ? `${formatKg(ex.carriageKgPerSide)} kg/side` : "not set"}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit carriage for ${ex.name}`}
          className="h-11 -my-2 -mr-2 px-3 rounded-[10px] text-sm text-accent hover:bg-surface-2"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className={cn("flex flex-col gap-2 pt-1", ex.blocked && "pl-9")}
    >
      <label htmlFor={inputId} className="text-[13px] text-muted">
        Carriage per side (kg) — saved per machine, added to the plates you log.
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 8.2"
          className="input-base h-11 py-0 w-28 font-display text-lg"
        />
        <button type="button" onClick={() => setEditing(false)} className="btn-ghost px-4 flex-1">
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="h-11 px-4 flex-1 rounded-[10px] bg-accent text-accent-ink font-semibold text-sm disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function CreateExercise({ initialName, onDone }: { initialName: string; onDone: () => void }) {
  const router = useRouter();
  const nameId = useId();
  const catId = useId();
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState<string>(EXERCISE_CATEGORIES[0]);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) {
      toast.error("Give the exercise a name");
      return;
    }
    startTransition(async () => {
      try {
        await createCustomExercise({ name: name.trim(), category });
        toast.success(`Added ${name.trim()}`);
        onDone();
        router.refresh();
      } catch {
        toast.error("Failed to create exercise");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="card flex flex-col gap-3 animate-fade-in"
      aria-label="New custom exercise"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={nameId} className="text-xs text-muted">
          Name
        </label>
        <input
          id={nameId}
          type="text"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-base h-12 py-0"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={catId} className="text-xs text-muted">
          Category
        </label>
        <select id={catId} value={category} onChange={(e) => setCategory(e.target.value)} className="select-base h-12 py-0">
          {EXERCISE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onDone} className="btn-ghost">
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-[10px] bg-accent text-accent-ink font-semibold text-sm disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add exercise"}
        </button>
      </div>
    </form>
  );
}
