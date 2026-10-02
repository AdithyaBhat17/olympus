"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatSleep } from "@/domain/recovery";
import { TARGETS } from "@/domain/targets";
import { upsertCheckInAction } from "@/lib/liftlog-actions";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/session/sheet";
import { WarnIcon } from "@/components/session/icons";
import { useAction } from "@/components/session/use-action";

type Field = "sleep" | "protein" | "water";
type Source = "manual" | "claude" | "whoop" | "apple_health";

export interface RecoveryCardProps {
  date: string;
  sleepMin: number | null;
  proteinG: number | null;
  waterMl: number | null;
  sources: Partial<Record<Field, Source>>;
  holdMessage: string | null;
}

const SOURCE_LABEL: Partial<Record<Source, string>> = {
  whoop: "Whoop",
  apple_health: "Apple Health",
};

/** 1200 → "1.2" */
function litres(ml: number): string {
  return String(Math.round(ml / 100) / 10);
}

function Tile({
  label,
  value,
  unit,
  sub,
  source,
  danger,
  onClick,
}: {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  source?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${value}${unit ?? ""}. ${sub}${source ? `. From ${source}` : ""}. Edit`}
      className={cn(
        "text-left p-3 rounded-xl border flex flex-col gap-0.5 min-w-0",
        danger ? "border-danger bg-danger-bg" : "border-line bg-surface-2"
      )}
    >
      <span className="text-xs text-muted">{label}</span>
      <span className="font-display text-[28px] font-semibold leading-[1.1] tabular-nums whitespace-nowrap">
        {value}
        {unit && <span className="text-base text-muted">{unit}</span>}
      </span>
      <span className={cn("text-xs", danger ? "text-danger-soft" : "text-muted")}>{sub}</span>
      {source && (
        <span className="text-[10px] uppercase tracking-[0.06em] text-faint truncate">{source}</span>
      )}
    </button>
  );
}

export function RecoveryCard(props: RecoveryCardProps) {
  const { sleepMin, proteinG, waterMl, sources, holdMessage } = props;
  const [editing, setEditing] = useState<Field | null>(null);
  const short = sleepMin != null && sleepMin < TARGETS.minSleepMin;

  return (
    <section aria-labelledby="recovery-h" className="mx-5 mt-4 card flex flex-col gap-3.5">
      <div className="flex justify-between items-center">
        <h2 id="recovery-h" className="eyebrow m-0">
          Recovery check-in
        </h2>
        <span className="text-[13px] text-muted">Before you train</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Tile
          label="Sleep"
          value={formatSleep(sleepMin)}
          sub={
            sleepMin == null
              ? "Tap to log"
              : short
                ? `Under ${TARGETS.minSleepMin / 60} h`
                : "Gate met"
          }
          danger={short}
          source={sources.sleep ? SOURCE_LABEL[sources.sleep] : undefined}
          onClick={() => setEditing("sleep")}
        />
        <Tile
          label="Protein"
          value={proteinG == null ? "—" : String(proteinG)}
          unit={` /${TARGETS.proteinG} g`}
          sub={proteinG == null ? "Tap to log" : proteinG >= TARGETS.proteinG ? "Floor hit" : "Floor, not range"}
          source={sources.protein ? SOURCE_LABEL[sources.protein] : undefined}
          onClick={() => setEditing("protein")}
        />
        <Tile
          label="Water"
          value={waterMl == null ? "—" : litres(waterMl)}
          unit={` /${litres(TARGETS.waterMl)} L`}
          sub={
            waterMl == null
              ? "Tap to log"
              : waterMl >= TARGETS.waterMl
                ? "Target hit"
                : `${litres(TARGETS.waterMl - waterMl)} L to go`
          }
          source={sources.water ? SOURCE_LABEL[sources.water] : undefined}
          onClick={() => setEditing("water")}
        />
      </div>

      {holdMessage && (
        <div className="flex gap-2.5 items-start p-3 rounded-xl bg-surface-2">
          <WarnIcon size={20} className="shrink-0 mt-px text-danger-soft" />
          <div className="flex flex-col gap-0.5">
            <strong className="text-sm font-semibold">Progression on hold today</strong>
            <span className="text-[13px] text-muted leading-[1.4]">{holdMessage}</span>
          </div>
        </div>
      )}

      <Sheet
        open={editing != null}
        onClose={() => setEditing(null)}
        label={editing ? `Log ${editing}` : "Log check-in"}
      >
        {editing && <CheckInForm key={editing} field={editing} {...props} onDone={() => setEditing(null)} />}
      </Sheet>
    </section>
  );
}

const FIELD_INPUT =
  "w-full h-14 rounded-xl bg-bg border border-line-strong text-fg text-center font-display text-[28px] font-semibold tabular-nums focus:outline-none focus:border-accent placeholder:text-faint";

function CheckInForm({
  field,
  date,
  sleepMin,
  proteinG,
  waterMl,
  onDone,
}: RecoveryCardProps & { field: Field; onDone: () => void }) {
  const { run, busy } = useAction();
  const [h, setH] = useState(sleepMin != null ? String(Math.floor(sleepMin / 60)) : "");
  const [m, setM] = useState(sleepMin != null ? String(Math.round(sleepMin % 60)) : "");
  const [protein, setProtein] = useState(proteinG != null ? String(proteinG) : "");
  const [water, setWater] = useState(waterMl != null ? litres(waterMl) : "");

  const current = field === "sleep" ? sleepMin : field === "protein" ? proteinG : waterMl;

  const save = async (clear = false) => {
    let patch: { sleepMin?: number | null; proteinG?: number | null; waterMl?: number | null };
    if (field === "sleep") {
      const hours = h.trim() === "" ? 0 : parseInt(h, 10);
      const mins = m.trim() === "" ? 0 : parseInt(m, 10);
      const total = hours * 60 + mins;
      if (!clear && (!Number.isFinite(total) || (h.trim() === "" && m.trim() === "") || mins > 59 || total > 1440)) {
        return toastInvalid("Enter hours and minutes (minutes 0–59).");
      }
      patch = { sleepMin: clear ? null : total };
    } else if (field === "protein") {
      const g = parseInt(protein, 10);
      if (!clear && (!Number.isFinite(g) || g < 0 || g > 1000)) return toastInvalid("Enter grams of protein.");
      patch = { proteinG: clear ? null : g };
    } else {
      const v = parseFloat(water.replace(",", "."));
      if (!clear && (!Number.isFinite(v) || v < 0)) return toastInvalid("Enter litres (or ml).");
      // Anything above 20 is clearly millilitres.
      const ml = v > 20 ? Math.round(v) : Math.round(v * 1000);
      if (!clear && ml > 20000) return toastInvalid("That's more than 20 L.");
      patch = { waterMl: clear ? null : ml };
    }
    const res = await run(() => upsertCheckInAction({ date, ...patch }));
    if (res.ok) onDone();
  };

  const title = field === "sleep" ? "Sleep last night" : field === "protein" ? "Protein today" : "Water today";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-col">
        <span className="text-[13px] text-muted">Recovery check-in</span>
        <span className="font-semibold">{title}</span>
      </div>

      {field === "sleep" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Hours</span>
            <input
              data-autofocus
              value={h}
              onChange={(e) => setH(e.target.value.replace(/\D/g, "").slice(0, 2))}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="7"
              className={FIELD_INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Minutes</span>
            <input
              value={m}
              onChange={(e) => setM(e.target.value.replace(/\D/g, "").slice(0, 2))}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="30"
              className={FIELD_INPUT}
            />
          </label>
        </div>
      )}
      {field === "protein" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Grams so far — floor is {TARGETS.proteinG} g</span>
          <input
            data-autofocus
            value={protein}
            onChange={(e) => setProtein(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            className={FIELD_INPUT}
          />
        </label>
      )}
      {field === "water" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Litres so far (or type ml, e.g. 750) — target {litres(TARGETS.waterMl)} L</span>
          <input
            data-autofocus
            value={water}
            onChange={(e) => setWater(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))}
            inputMode="decimal"
            placeholder="0.0"
            className={FIELD_INPUT}
          />
        </label>
      )}

      <button type="submit" className="btn-primary" disabled={busy}>
        Save
      </button>
      {current != null && (
        <button type="button" className="btn-ghost w-full" disabled={busy} onClick={() => void save(true)}>
          Clear
        </button>
      )}
    </form>
  );
}

function toastInvalid(msg: string) {
  toast.error(msg);
}
