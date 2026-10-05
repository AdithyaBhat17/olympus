import { cn } from "@/lib/utils";

/** Decorative stack of plates seen at an angle, tinted from the session colour. */
export function PlateStack({ className, size = 190 }: { className?: string; size?: number }) {
  const hole = Math.round(size * 0.25);
  const step = Math.round(size * 0.18);
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute animate-bob", className)}
      style={{ width: size + step * 2, height: size }}
    >
      <div className="absolute top-0 rounded-full bg-k-1" style={{ left: 0, width: size, height: size }} />
      <div className="absolute top-0 rounded-full bg-k-2" style={{ left: step, width: size, height: size }} />
      <div className="absolute top-0 rounded-full bg-k-3" style={{ left: step * 2, width: size, height: size }} />
      <div
        className="absolute rounded-full bg-k"
        style={{ left: step * 2 + size / 2 - hole / 2, top: size / 2 - hole / 2, width: hole, height: hole }}
      />
    </div>
  );
}
