"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { retireConstraintAction, saveConstraintAction } from "@/app/(app)/settings/actions";

export interface InjuryItem {
  id: string;
  region: string;
  rule: string;
  blockedPatterns: string[];
}

/**
 * Settings › Injuries & limits. Each one is a rule for your PT plus the
 * movements it rules out: an exercise is blocked when every word of a
 * pattern is in its name ("barbell curl" blocks "Barbell Curl (straight bar)").
 */
export function Injuries({ items }: { items: InjuryItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<InjuryItem | "new" | null>(null);
  const [pending, start] = useTransition();

  function retire(item: InjuryItem) {
    if (!confirm(`Remove "${item.region}"? Its blocked movements become available again.`)) return;
    start(async () => {
      const res = await retireConstraintAction(item.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${item.region} removed`);
      router.refresh();
    });
  }

  return (
    <div className="card-group">
      {items.length === 0 && editing == null && (
        <p className="m-0 px-4 py-4 text-sm text-muted">
          None on file. Add an injury and your PT won&apos;t programme the movements it rules out.
        </p>
      )}
      {items.map((item) =>
        editing !== "new" && editing?.id === item.id ? (
          <InjuryForm key={item.id} initial={item} onDone={() => setEditing(null)} />
        ) : (
          <div key={item.id} className="px-4 py-3.5 border-b border-line flex flex-col gap-1.5">
            <div className="flex items-start gap-3">
              <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="font-semibold">{item.region}</span>
                <span className="text-[13px] text-muted leading-snug">{item.rule}</span>
              </span>
              <span className="flex -my-2 -mr-2 shrink-0">
                <button type="button" onClick={() => setEditing(item)} className="h-11 px-3 text-sm text-accent">
                  Edit
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => retire(item)}
                  className="h-11 px-3 text-sm text-danger-soft disabled:opacity-50"
                >
                  Remove
                </button>
              </span>
            </div>
            {item.blockedPatterns.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {item.blockedPatterns.map((p) => (
                  <span key={p} className="tag">
                    {p}
                  </span>
                ))}
              </span>
            )}
          </div>
        )
      )}
      {editing === "new" ? (
        <InjuryForm onDone={() => setEditing(null)} />
      ) : (
        <button type="button" onClick={() => setEditing("new")} className="w-full min-h-14 px-4 text-left text-sm text-accent">
          Add an injury or limit
        </button>
      )}
    </div>
  );
}

function InjuryForm({ initial, onDone }: { initial?: InjuryItem; onDone: () => void }) {
  const router = useRouter();
  const id = useId();
  const [region, setRegion] = useState(initial?.region ?? "");
  const [rule, setRule] = useState(initial?.rule ?? "");
  const [patterns, setPatterns] = useState(initial?.blockedPatterns.join(", ") ?? "");
  const [pending, start] = useTransition();

  function submit() {
    if (!region.trim() || !rule.trim()) {
      toast.error("Name it and say what to avoid");
      return;
    }
    start(async () => {
      const res = await saveConstraintAction({
        region,
        rule,
        blockedPatterns: patterns.split(","),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${region.trim()} saved`);
      onDone();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="p-4 border-b border-line flex flex-col gap-3 animate-fade-in"
      aria-label={initial ? `Edit ${initial.region}` : "Add an injury"}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-region`} className="text-xs text-muted px-1">
          Where
        </label>
        <input
          id={`${id}-region`}
          type="text"
          maxLength={80}
          autoFocus
          // Renaming would make a second one; the region is the key.
          readOnly={!!initial}
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder="Left knee"
          className="input-base read-only:text-muted"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-rule`} className="text-xs text-muted px-1">
          Rule for your PT
        </label>
        <input
          id={`${id}-rule`}
          type="text"
          maxLength={500}
          value={rule}
          onChange={(e) => setRule(e.target.value)}
          placeholder="No deep knee flexion under load"
          className="input-base"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-patterns`} className="text-xs text-muted px-1">
          Blocked movements, comma-separated
        </label>
        <input
          id={`${id}-patterns`}
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          value={patterns}
          onChange={(e) => setPatterns(e.target.value)}
          placeholder="lunge, pistol squat"
          className="input-base"
        />
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
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
