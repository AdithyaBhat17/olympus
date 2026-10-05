import type { ExerciseMeta } from "@/server/sessions";
import { formatKg } from "@/domain/load";

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25] as const;
const BAR_KG = 20;
const SIZE: Record<number, { w: number; h: number; opacity: number }> = {
  25: { w: 26, h: 112, opacity: 1 },
  20: { w: 24, h: 112, opacity: 0.85 },
  15: { w: 22, h: 96, opacity: 0.75 },
  10: { w: 20, h: 84, opacity: 0.65 },
  5: { w: 14, h: 64, opacity: 0.6 },
  2.5: { w: 12, h: 50, opacity: 0.55 },
  1.25: { w: 10, h: 40, opacity: 0.5 },
};

/**
 * Plates to load on one side, or null when the exercise isn't plate-loaded.
 * Barbell: (total - 20 kg bar) / 2. Per-side machines: the per-side load minus the carriage.
 */
export function platesFor(ex: ExerciseMeta, kg: number | null): { plates: number[]; leftover: number } | null {
  if (kg == null) return null;
  let side: number;
  if (ex.loadMode === "TOTAL" && ex.equipment === "barbell") side = (kg - BAR_KG) / 2;
  else if (ex.loadMode === "PER_SIDE" && ex.carriageKgPerSide != null) side = kg - ex.carriageKgPerSide;
  else return null;
  const plates: number[] = [];
  for (const p of PLATES) {
    while (side + 1e-9 >= p) {
      side -= p;
      plates.push(p);
    }
  }
  const perSide = ex.loadMode === "PER_SIDE" ? 1 : 2;
  return { plates, leftover: Math.max(0, Math.round(side * perSide * 100) / 100) };
}

/** One side of the bar in the text colour; plates slide on as the load changes. */
export function Plates({ plates, leftover }: { plates: number[]; leftover: number }) {
  const label = plates.length ? `${plates.map((p) => formatKg(p)).join(" + ")} each side` : "Just the bar";
  return (
    <div role="img" aria-label={`${label}${leftover > 0 ? `, ${formatKg(leftover)} kg short` : ""}`} className="flex flex-col gap-1">
      <div className="relative h-[116px]">
      <div className="absolute left-0 top-[52px] h-3 w-[38%] rounded-r-md bg-current opacity-50" />
      <div className="absolute left-[38%] top-[38px] h-10 w-3.5 rounded bg-current" />
      <div className="absolute left-[calc(38%+14px)] right-0 top-[54px] h-2 rounded bg-current opacity-50" />
      <div className="absolute inset-y-0 left-[calc(38%+18px)] flex items-center gap-1">
        {plates.map((p, i) => (
          <div key={`${i}-${p}`} style={{ opacity: SIZE[p].opacity }}>
            <div
              className="animate-plate-in rounded-lg bg-current"
              style={{ width: SIZE[p].w, height: SIZE[p].h, animationDelay: `${i * 60}ms` }}
            />
          </div>
        ))}
      </div>
      </div>
      <span className="self-end text-[15px] font-semibold opacity-90">
        {label}
        {leftover > 0 && `, ${formatKg(leftover)} kg short`}
      </span>
    </div>
  );
}
