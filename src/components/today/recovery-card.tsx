"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatSleep } from "@/domain/recovery";
import { TARGETS } from "@/domain/targets";
import { mutate } from "@/lib/offline/mutate";
import { hapticTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/session/sheet";
import { WarnIcon } from "@/components/session/icons";

type Field = "sleep" | "protein" | "water";
type Source = "manual" | "claude" | "whoop" | "apple_health";

interface Values {
  sleepMin: number | null;
  proteinG: number | null;
  waterMl: number | null;
}

export interface RecoveryCardProps extends Values {
  date: string;
  targets: { sleepMin: number; proteinG: number; waterMl: number };
  sources: Partial<Record<Field, Source>>;
  holdMessage: string | null;
}

const SOURCE_LABEL: Record<Source, string> = {
  whoop: "Whoop",
  apple_health: "Apple Health",
  claude: "Claude",
  manual: "Manual",
};

const WATER_STEP = 250;
const R = 27;
const C = 2 * Math.PI * R; // 169.6

/** 1750 → "1.75", 2000 → "2" */
function litres(ml: number): string {
  return String(Math.round(ml / 10) / 100);
}

function Ring({ value, target, color, delay = 0 }: { value: number | null; target: number; color: string; delay?: number }) {
  const frac = value == null ? 0 : Math.min(1, value / target);
  const offset = C * (1 - frac);
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r={R} fill="none" stroke="#26262A" strokeWidth="7" />
      <circle
        cx="32"
        cy="32"
        r={R}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={offset}
        transform="rotate(-90 32 32)"
        className="animate-[ring-in_.9s_cubic-bezier(.2,.8,.2,1)_both] transition-[stroke-dashoffset] duration-[350ms] ease-arrive"
        style={{ ["--full" as string]: C, animationDelay: `${delay}ms` }}
      />
    </svg>
  );
}

export function RecoveryCard(props: RecoveryCardProps) {
  const { date, targets, sources, holdMessage } = props;
  const [vals, setVals] = useState<Values>({ sleepMin: props.sleepMin, proteinG: props.proteinG, waterMl: props.waterMl });
  const [editing, setEditing] = useState<Field | null>(null);

  // Server truth wins whenever a fresh render arrives.
  useEffect(() => {
    setVals({ sleepMin: props.sleepMin, proteinG: props.proteinG, waterMl: props.waterMl });
  }, [props.sleepMin, props.proteinG, props.waterMl]);

  const save = (patch: Partial<Values>) => {
    const before = vals;
    void mutate({ kind: "checkIn", input: { date, ...patch } }, {
      apply: () => setVals((v) => ({ ...v, ...patch })),
      rollback: () => setVals(before),
    });
  };

  const addWater = () => {
    hapticTick();
    save({ waterMl: Math.min(20000, (vals.waterMl ?? 0) + WATER_STEP) });
  };

  const short = vals.sleepMin != null && vals.sleepMin < TARGETS.minSleepMin;
  const srcLine = Array.from(
    new Set(Object.values(sources).filter((s): s is Source => !!s && s !== "manual").map((s) => SOURCE_LABEL[s]))
  ).join(" · ");

  const tile = "rounded-[18px] bg-surface-2 pt-3.5 pb-3 px-2 flex flex-col items-center gap-2 min-w-0";

  return (
    <section
      aria-labelledby="rec-h"
      className="arrive arrive-2 mx-3 mt-3 pt-[18px] pb-4 px-4 rounded-[24px] bg-surface shadow-[inset_0_0_0_1px_#232327] flex flex-col gap-3.5"
    >
      <div className="flex justify-between items-center">
        <h2 id="rec-h" className="section-label m-0">
          Recovery
        </h2>
        <span className="text-xs text-muted">{srcLine || "Tap to log"}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setEditing("sleep")}
          aria-label={`Sleep ${formatSleep(vals.sleepMin)} of ${targets.sleepMin / 60} h. Edit`}
          className={tile}
        >
          <Ring value={vals.sleepMin} target={targets.sleepMin} color={short ? "#FF7A6B" : "#B7A6FF"} />
          <span className="num text-[20px]">{vals.sleepMin == null ? "—" : formatSleep(vals.sleepMin).replace(/\s|m$/g, "")}</span>
          <span className={cn("text-xs", short ? "text-danger-text" : "text-muted")}>{short ? "Short sleep" : "Sleep"}</span>
        </button>
        <button
          type="button"
          onClick={() => setEditing("protein")}
          aria-label={`Protein ${vals.proteinG ?? 0} of ${targets.proteinG} grams. Edit`}
          className={tile}
        >
          <Ring value={vals.proteinG} target={targets.proteinG} color="#FF6A2B" delay={80} />
          <span className="num text-[20px]">
            {vals.proteinG ?? "—"}
            <span className="text-[13px] text-muted">/{targets.proteinG}g</span>
          </span>
          <span className="text-xs text-muted">Protein</span>
        </button>
        <button
          type="button"
          onClick={addWater}
          aria-label={`Water ${litres(vals.waterMl ?? 0)} of ${litres(targets.waterMl)} litres. Add 250 ml`}
          className={tile}
        >
          <span className="relative">
            <Ring value={vals.waterMl} target={targets.waterMl} color="#8CC8FF" delay={160} />
            <svg aria-hidden="true" className="absolute inset-0" width="64" height="64" viewBox="0 0 64 64">
              <path d="M32 24v16M24 32h16" stroke="#8CC8FF" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </span>
          <span key={vals.waterMl ?? 0} className="num text-[20px] animate-tick">
            {litres(vals.waterMl ?? 0)}
            <span className="text-[13px] text-muted">/{litres(targets.waterMl)}L</span>
          </span>
          <span className="text-xs text-muted">Water · tap +250</span>
        </button>
      </div>

      {holdMessage && (
        <div className="flex gap-2.5 items-start p-3 rounded-[14px] bg-surface-2">
          <WarnIcon size={20} className="shrink-0 mt-px text-danger" />
          <div className="flex flex-col gap-0.5">
            <strong className="text-sm font-semibold">Progression on hold today</strong>
            <span className="text-[13px] text-muted leading-[1.4]">{holdMessage}</span>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setEditing("water")}
        className="self-center -mt-1 -mb-1 min-h-11 px-3 text-[13px] text-muted"
      >
        Edit water total
      </button>

      <Sheet open={editing != null} onClose={() => setEditing(null)} label={editing ? `Log ${editing}` : "Log check-in"}>
        {editing && (
          <CheckInForm
            key={editing}
            field={editing}
            values={vals}
            targets={targets}
            onSave={(patch) => {
              save(patch);
              setEditing(null);
            }}
          />
        )}
      </Sheet>
    </section>
  );
}

const FIELD_INPUT =
  "w-full h-14 rounded-[14px] bg-bg text-fg text-center num text-[28px] focus:outline-none shadow-[inset_0_0_0_1px_#2A2A2E] focus:shadow-[inset_0_0_0_1.5px_#FF6A2B] placeholder:text-faint";

function CheckInForm({
  field,
  values,
  targets,
  onSave,
}: {
  field: Field;
  values: Values;
  targets: RecoveryCardProps["targets"];
  onSave: (patch: Partial<Values>) => void;
}) {
  const { sleepMin, proteinG, waterMl } = values;
  const [h, setH] = useState(sleepMin != null ? String(Math.floor(sleepMin / 60)) : "");
  const [m, setM] = useState(sleepMin != null ? String(Math.round(sleepMin % 60)) : "");
  const [protein, setProtein] = useState(proteinG != null ? String(proteinG) : "");
  const [water, setWater] = useState(waterMl != null ? litres(waterMl) : "");

  const current = field === "sleep" ? sleepMin : field === "protein" ? proteinG : waterMl;

  const submit = (clear = false) => {
    if (field === "sleep") {
      const hours = h.trim() === "" ? 0 : parseInt(h, 10);
      const mins = m.trim() === "" ? 0 : parseInt(m, 10);
      const total = hours * 60 + mins;
      if (!clear && (!Number.isFinite(total) || (h.trim() === "" && m.trim() === "") || mins > 59 || total > 1440)) {
        return toast.error("Enter hours and minutes (minutes 0–59).");
      }
      return onSave({ sleepMin: clear ? null : total });
    }
    if (field === "protein") {
      const g = parseInt(protein, 10);
      if (!clear && (!Number.isFinite(g) || g < 0 || g > 1000)) return toast.error("Enter grams of protein.");
      return onSave({ proteinG: clear ? null : g });
    }
    const v = parseFloat(water.replace(",", "."));
    if (!clear && (!Number.isFinite(v) || v < 0)) return toast.error("Enter litres (or ml).");
    // Anything above 20 is clearly millilitres.
    const ml = v > 20 ? Math.round(v) : Math.round(v * 1000);
    if (!clear && ml > 20000) return toast.error("That's more than 20 L.");
    onSave({ waterMl: clear ? null : ml });
  };

  const title = field === "sleep" ? "Sleep last night" : field === "protein" ? "Protein today" : "Water today";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col px-1.5">
        <span className="text-[13px] text-muted">Recovery check-in</span>
        <span className="text-[17px] font-cta">{title}</span>
      </div>

      {field === "sleep" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted px-1">Hours</span>
            <input data-autofocus value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" pattern="[0-9]*" placeholder="7" className={FIELD_INPUT} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted px-1">Minutes</span>
            <input value={m} onChange={(e) => setM(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" pattern="[0-9]*" placeholder="30" className={FIELD_INPUT} />
          </label>
        </div>
      )}
      {field === "protein" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted px-1">Grams so far — floor is {targets.proteinG} g</span>
          <input data-autofocus value={protein} onChange={(e) => setProtein(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" pattern="[0-9]*" placeholder="0" className={FIELD_INPUT} />
        </label>
      )}
      {field === "water" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted px-1">Litres so far (or type ml, e.g. 750) — target {litres(targets.waterMl)} L</span>
          <input data-autofocus value={water} onChange={(e) => setWater(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))} inputMode="decimal" placeholder="0.0" className={FIELD_INPUT} />
        </label>
      )}

      <button type="submit" className="btn-primary">
        Save
      </button>
      {current != null && (
        <button type="button" className="btn-ghost w-full" onClick={() => submit(true)}>
          Clear
        </button>
      )}
    </form>
  );
}
