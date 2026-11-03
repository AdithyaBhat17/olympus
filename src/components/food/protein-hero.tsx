import type { DayView } from "@/server/food/logs";

const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");

/**
 * Protein first, as a colour block like Today's session card. The bar is cut
 * into the day's feedings, so how protein is spread across meals is visible,
 * not just the total. Calories and the other macros sit underneath, smaller.
 */
export function ProteinHero({ view }: { view: DayView }) {
  const { totals, targets, remaining } = view;
  const target = targets.protein;
  const eaten = Math.round(totals.proteinCounted);
  const toGo = remaining.protein != null ? Math.max(0, Math.round(remaining.protein)) : null;

  // One segment per log (a feeding), in order eaten.
  const feedings = view.logs.map((l) => ({ id: l.id, protein: l.totals.protein })).filter((f) => f.protein > 0);
  const scale = target ? Math.max(target, eaten) : Math.max(eaten, 1);
  const perFeeding = target ? Math.round(target / 4 / 5) * 5 : null;

  const status =
    target == null ? null : toGo === 0 ? "Target reached" : `${toGo} g to go`;
  const caption = !feedings.length
    ? perFeeding
      ? `Nothing yet. Four feedings of about ${perFeeding} g gets you there.`
      : "Nothing logged yet."
    : `${feedings.length} ${feedings.length === 1 ? "feeding" : "feedings"}, largest ${Math.round(Math.max(...feedings.map((f) => f.protein)))} g`;

  const over = remaining.kcal != null && remaining.kcal < 0;

  return (
    <section aria-label="Protein and calories" className="kind-accent arrive arrive-1 relative overflow-hidden mx-4 mt-4 rounded-[36px] bg-k text-k-on">
      {/* Soft rings, the same language as the session card's plates. */}
      <div aria-hidden="true" className="absolute -right-16 -top-20 w-64 h-64 rounded-full bg-[rgb(var(--k1))]" />
      <div aria-hidden="true" className="absolute -right-6 -top-8 w-40 h-40 rounded-full bg-[rgb(var(--k2))]" />

      <div className="relative px-6 pt-5 pb-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[17px] font-semibold opacity-90">Protein</span>
          {status && <span className="on-k h-8 px-3 rounded-full text-[13px] font-bold inline-flex items-center">{status}</span>}
        </div>

        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="num text-[64px] tracking-[-1.5px]">{eaten}</span>
          <span className="num text-[22px] opacity-75">{target != null ? `/ ${target} g` : "g"}</span>
        </div>

        <div className="mt-4 h-3 rounded-full bg-white/20 flex gap-[3px] overflow-hidden" role="img" aria-label={caption}>
          {feedings.map((f) => (
            <span key={f.id} className="h-full bg-white first:rounded-l-full last:rounded-r-full" style={{ width: `${(f.protein / scale) * 100}%` }} />
          ))}
        </div>
        <p className="m-0 mt-2.5 text-[14px] font-medium opacity-85">{caption}</p>
        {totals.proteinExcluded > 0 && (
          <p className="m-0 mt-1 text-[13px] opacity-70">Plus {fmt(totals.proteinExcluded)} g collagen, not counted</p>
        )}
      </div>

      <dl className="relative m-0 grid grid-cols-[1.5fr_1fr_1fr_1fr] bg-black/10 px-6 py-4">
        <div>
          <dt className="text-[12px] font-bold opacity-70">Calories</dt>
          <dd className="m-0 mt-1 flex items-baseline gap-1">
            <span className="num text-[19px]">{fmt(totals.kcal)}</span>
            {targets.kcal != null && <span className="num text-[13px] opacity-70">/ {fmt(targets.kcal)}</span>}
          </dd>
          {remaining.kcal != null && (
            <span className={over ? "text-[12px] font-bold" : "text-[12px] opacity-70"}>{over ? `${fmt(-remaining.kcal)} over` : `${fmt(remaining.kcal)} left`}</span>
          )}
        </div>
        {(
          [
            ["Carbs", totals.carbs],
            ["Fat", totals.fat],
            ["Fibre", totals.fibre],
          ] as const
        ).map(([label, v]) => (
          <div key={label}>
            <dt className="text-[12px] font-bold opacity-70">{label}</dt>
            <dd className="m-0 mt-1 flex items-baseline gap-0.5">
              <span className="num text-[19px]">{fmt(v)}</span>
              <span className="text-[13px] font-semibold opacity-70">g</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
