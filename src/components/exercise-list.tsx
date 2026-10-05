"use client";

import { useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn, formatCategory } from "@/lib/utils";
import { EXERCISE_CATEGORIES } from "@/lib/constants";
import { createCustomExercise } from "@/lib/actions";
import { setCarriageAction, setExerciseBlockAction } from "@/lib/liftlog-actions";
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
  isCompound: boolean;
  equipment: string | null;
  hasFormCues: boolean;
  workingKg: number | null;
  blocked: boolean;
  blockedReason: string | null;
  /** you = a personal block (can be undone here); injury = a Settings constraint. */
  blockedBy: "you" | "injury" | "library" | null;
  substitutes: string[];
}

interface ExerciseListProps {
  exercises: LibraryExercise[];
}

type Filter = "all" | "push" | "pull" | "legs" | "arms" | "core" | "cardio" | "blocked";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "push", label: "Push" },
  { id: "pull", label: "Pull" },
  { id: "legs", label: "Legs" },
  { id: "arms", label: "Arms" },
  { id: "core", label: "Core" },
  { id: "cardio", label: "Cardio" },
  { id: "blocked", label: "Blocked" },
];

function groupOf(category: string): Exclude<Filter, "all" | "blocked"> {
  if (/Push/.test(category)) return "push";
  if (/Pull/.test(category)) return "pull";
  if (/Lower Body|Calves/.test(category)) return "legs";
  if (/Arms/.test(category)) return "arms";
  if (/Cardio/.test(category)) return "cardio";
  return "core";
}

/** Small pills: equipment, compound, load-mode rules. */
function tagsFor(ex: LibraryExercise): Array<{ text: string; info?: boolean }> {
  const tags: Array<{ text: string; info?: boolean }> = [];
  if (ex.equipment) {
    const e = ex.equipment.replace(/_/g, " ").toLowerCase();
    tags.push({ text: e.charAt(0).toUpperCase() + e.slice(1) });
  }
  if (ex.isCompound) tags.push({ text: "Compound" });
  if (ex.loadMode === "COUNTERWEIGHT") tags.push({ text: "Counterweight, lower is harder", info: true });
  if (ex.loadMode === "PER_SIDE")
    tags.push({
      text: `Per side${ex.carriageKgPerSide != null ? `, +${formatKg(ex.carriageKgPerSide)}` : ""}`,
      info: true,
    });
  if (ex.loadMode === "TIME") tags.push({ text: "Timed" });
  if (ex.status === "SUB") tags.push({ text: "Substitute" });
  if (ex.isCustom) tags.push({ text: "Yours" });
  if (ex.hasFormCues) tags.push({ text: "Form cues" });
  return tags.slice(0, 3);
}

export default function ExerciseList({ exercises }: ExerciseListProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const searchId = useId();

  const filtered = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return exercises.filter((e) => {
      if (filter === "blocked" ? !e.blocked : filter !== "all" && groupOf(e.category) !== filter) return false;
      if (!words.length) return true;
      const hay = `${e.name} ${e.category}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [exercises, search, filter]);

  const grouped = useMemo(() => {
    const known = EXERCISE_CATEGORIES as readonly string[];
    const cats = [...known, ...Array.from(new Set(filtered.map((e) => e.category))).filter((c) => !known.includes(c))];
    return cats
      .map((category) => ({ category, exercises: filtered.filter((e) => e.category === category) }))
      .filter((g) => g.exercises.length > 0);
  }, [filtered]);

  const searching = search.trim().length > 0;

  return (
    <div className="flex flex-col">
      <div className="arrive arrive-1 px-3 pt-4">
        <label
          htmlFor={searchId}
          className="search-field"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" className="shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          <span className="sr-only">Search exercises</span>
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exercises"
            enterKeyHint="search"
            className="flex-1 min-w-0 bg-transparent text-[16px] text-fg placeholder:text-faint outline-none"
          />
        </label>
      </div>

      <div role="group" aria-label="Filter" className="arrive arrive-2 scroller flex gap-1.5 px-3 pt-3 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn("chip h-11", filter === f.id && "chip-on")}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-3 pt-2">
        {!creating ? (
          <button type="button" onClick={() => setCreating(true)} className="min-h-11 px-2 text-sm text-accent flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {searching && filtered.length === 0 ? `Add “${search.trim()}” as a custom exercise` : "New custom exercise"}
          </button>
        ) : (
          <CreateExercise initialName={search.trim()} onDone={() => setCreating(false)} />
        )}
      </div>

      {grouped.length === 0 && (
        <p className="px-5 py-8 text-sm text-muted text-center">
          {searching ? `No exercises match “${search.trim()}”.` : "Nothing in this filter."}
        </p>
      )}

      {grouped.map(({ category, exercises: exs }, gi) => (
        <section key={category} aria-labelledby={`lib-${gi}`} className="arrive arrive-3 mx-3 mt-5">
          <h2 id={`lib-${gi}`} className="section-label mx-2 mb-2.5">
            {formatCategory(category)}
          </h2>
          <ul className="card-group m-0 p-0 list-none">
            {exs.map((ex) => (
              <ExerciseRow key={ex.id} ex={ex} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ExerciseRow({ ex }: { ex: LibraryExercise }) {
  const tags = tagsFor(ex);
  const unit = ex.loadMode === "COUNTERWEIGHT" ? " cw" : ex.loadMode === "TIME" ? " min" : "";
  if (ex.blocked) {
    return (
      <li className="flex flex-col gap-1 px-4 py-3.5 border-b border-line last:border-b-0">
        <div className="flex items-center gap-3">
          <span className="flex-1 min-w-0 flex flex-col gap-1">
            <span className="font-semibold text-fg-2 line-through decoration-danger">{ex.name}</span>
            {ex.blockedReason && (
              <span className="text-xs text-danger-text flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" className="shrink-0">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M5.6 5.6l12.8 12.8" />
                </svg>
                {ex.blockedReason}
              </span>
            )}
          </span>
          {ex.blockedBy === "you" ? (
            <UnblockButton ex={ex} />
          ) : (
            <span className="text-[11px] text-muted">{ex.blockedBy === "injury" ? "Injury" : "Blocked"}</span>
          )}
        </div>
        {ex.substitutes.length > 0 && <p className="m-0 text-xs text-info">Use instead → {ex.substitutes.join(", ")}</p>}
      </li>
    );
  }
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={`/progress/${ex.id}`} className="press-soft flex items-center gap-3 px-4 py-3.5 text-fg">
        <span className="flex-1 min-w-0 flex flex-col gap-1">
          <span className="font-semibold">{ex.name}</span>
          {tags.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {tags.map((t) => (
                <span key={t.text} className={cn("tag", t.info && "tag-info")}>
                  {t.text}
                </span>
              ))}
            </span>
          )}
        </span>
        {ex.workingKg != null && (
          <span className="num text-[20px]">
            {formatKg(ex.workingKg)}
            {unit && <span className="text-[13px] text-muted">{unit}</span>}
          </span>
        )}
      </Link>
      {ex.loadMode === "PER_SIDE" && (
        <div className="px-4 pb-3 -mt-1">
          <CarriageEditor ex={ex} />
        </div>
      )}
    </li>
  );
}

function UnblockButton({ ex }: { ex: LibraryExercise }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Unblock ${ex.name}`}
      onClick={() =>
        startTransition(async () => {
          const res = await setExerciseBlockAction(ex.id, null);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(`${ex.name} is back in your library`);
          router.refresh();
        })
      }
      className="h-11 -my-2 -mr-2 px-3 rounded-[14px] text-sm text-accent disabled:opacity-50"
    >
      {pending ? "Unblocking…" : "Unblock"}
    </button>
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
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-muted">
          Carriage{" "}
          <span className="num text-base text-fg-2">
            {ex.carriageKgPerSide != null ? `${formatKg(ex.carriageKgPerSide)} kg/side` : "not set"}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit carriage for ${ex.name}`}
          className="h-11 -my-2 -mr-2 px-3 rounded-[14px] text-sm text-accent"
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
      className="flex flex-col gap-2 pt-1"
    >
      <label htmlFor={inputId} className="text-[13px] text-muted">
        Carriage per side (kg). Saved per machine and added to the plates you log.
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
          className="input-base h-11 w-28 num text-lg"
        />
        <button type="button" onClick={() => setEditing(false)} className="btn-ghost px-4 flex-1">
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="h-11 px-4 flex-1 rounded-[14px] bg-accent text-accent-ink font-semibold text-sm disabled:opacity-50"
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
          className="input-base"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={catId} className="text-xs text-muted">
          Category
        </label>
        <select id={catId} value={category} onChange={(e) => setCategory(e.target.value)} className="select-base">
          {EXERCISE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {formatCategory(c)}
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
          className="h-11 rounded-[14px] bg-accent text-accent-ink font-semibold text-sm disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add exercise"}
        </button>
      </div>
    </form>
  );
}
