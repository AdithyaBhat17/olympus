import type { DayView } from "@/server/food/logs";

function Bar({ pct, tone }: { pct: number; tone: "accent" | "fg" | "danger" }) {
  const w = Math.max(0, Math.min(100, pct));
  const color = tone === "accent" ? "bg-accent" : tone === "danger" ? "bg-danger" : "bg-fg-2";
  return (
    <div className="h-2 rounded-full bg-surface-3 overflow-hidden" aria-hidden>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
    </div>
  );
}

/**
 * Protein first (the priority macro), then calories. Remaining never
 * includes exercise: it's target minus what was eaten.
 */
export function DaySummary({ view }: { view: DayView }) {
  const { totals, remaining, targets } = view;
  const over = remaining.kcal != null && remaining.kcal < 0;
  return (
    <section aria-label="Day totals" className="card mx-3 mt-3 p-4 flex flex-col gap-4 arrive arrive-1">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-muted">Protein</span>
          <span className="text-[13px] text-muted">
            {targets.protein == null ? "no target" : remaining.protein! > 0 ? `${Math.round(remaining.protein!)} g to go` : "target reached"}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="num font-display font-black text-[40px] leading-none">{Math.round(totals.proteinCounted)}</span>
          <span className="num text-fg-2 text-[17px]">{targets.protein != null ? `/ ${targets.protein} g` : "g"}</span>
        </div>
        {targets.protein != null && <Bar pct={remaining.proteinPct ?? 0} tone="accent" />}
        {totals.proteinExcluded > 0 && (
          <span className="text-[12px] text-muted">+{totals.proteinExcluded} g collagen protein, not counted</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-muted">Calories</span>
          <span className={`text-[13px] ${over ? "text-danger-text" : "text-muted"}`}>
            {remaining.kcal == null ? "no target" : over ? `${-remaining.kcal} over` : `${remaining.kcal} left`}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="num font-display font-black text-[28px] leading-none">{Math.round(totals.kcal).toLocaleString()}</span>
          <span className="num text-fg-2 text-[15px]">{targets.kcal != null ? `/ ${targets.kcal.toLocaleString()}` : "kcal"}</span>
        </div>
        {targets.kcal != null && <Bar pct={remaining.kcalPct ?? 0} tone={over ? "danger" : "fg"} />}
      </div>

      <dl className="grid grid-cols-3 gap-2 m-0">
        {[
          ["Carbs", totals.carbs],
          ["Fat", totals.fat],
          ["Fibre", totals.fibre],
        ].map(([label, v]) => (
          <div key={label as string} className="rounded-[12px] bg-surface-2 px-3 py-2">
            <dt className="text-[12px] text-muted">{label}</dt>
            <dd className="m-0 num text-[17px]">{Math.round(v as number)} g</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
