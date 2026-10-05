const COLORS = ["rgb(var(--white))", "rgb(var(--apricot))", "rgb(var(--berry))", "rgb(var(--k3))"];

/**
 * A short burst of little plates falling once through the nearest positioned
 * ancestor (which should clip with overflow-hidden). Deterministic for SSR.
 */
export function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 18 }, (_, i) => {
        const size = 8 + ((i * 7) % 5) * 5;
        return (
          <span
            key={i}
            className="absolute top-0 animate-fall rounded-full"
            style={
              {
                left: `${(i * 53) % 100}%`,
                width: size,
                height: size,
                background: COLORS[i % COLORS.length],
                boxShadow: `inset 0 0 0 ${Math.round(size / 4)}px rgb(0 0 0 / .12)`,
                animationDelay: `${(i * 0.13) % 1.6}s`,
                "--dx": `${(i % 2 ? 1 : -1) * (10 + (i % 3) * 12)}px`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
