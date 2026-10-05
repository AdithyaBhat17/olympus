import { formatKg } from "@/domain/load";

const SIZE: Record<number, { w: number; h: number; opacity: number }> = {
  25: { w: 26, h: 112, opacity: 1 },
  20: { w: 24, h: 112, opacity: 0.85 },
  15: { w: 22, h: 96, opacity: 0.75 },
  10: { w: 20, h: 84, opacity: 0.65 },
  5: { w: 14, h: 64, opacity: 0.6 },
  2.5: { w: 12, h: 50, opacity: 0.55 },
  1.25: { w: 10, h: 40, opacity: 0.5 },
};

/** One side of the bar in the text colour; plates slide on as the load changes. */
export function Plates({ plates, leftover }: { plates: number[]; leftover: number }) {
  const label =
    leftover < 0
      ? `${formatKg(-leftover)} kg lighter than the bar`
      : `${plates.length ? `${plates.map((p) => formatKg(p)).join(" + ")} each side` : "Just the bar"}${
          leftover > 0 ? `, ${formatKg(leftover)} kg short` : ""
        }`;
  return (
    <div role="img" aria-label={label} className="flex flex-col gap-1">
      <div className="relative h-[116px]">
      <div className="absolute left-0 top-[52px] h-3 w-[38%] rounded-r-md bg-current opacity-50" />
      <div className="absolute left-[38%] top-[38px] h-10 w-3.5 rounded bg-current" />
      <div className="absolute left-[calc(38%+14px)] right-0 top-[54px] h-2 rounded bg-current opacity-50" />
      <div className="absolute inset-y-0 left-[calc(38%+18px)] flex items-center gap-1">
        {plates.map((p, i) => (
          <div
            key={`${i}-${p}`}
            className="animate-plate-in rounded-lg bg-current"
            style={{ width: SIZE[p].w, height: SIZE[p].h, animationDelay: `${i * 60}ms`, ["--o" as string]: SIZE[p].opacity }}
          />
        ))}
      </div>
      </div>
      <span className="self-end text-[15px] font-semibold opacity-90">{label}</span>
    </div>
  );
}
