const COLORS = ["#FFFFFF", "#F2A65A", "#8E3B5E", "rgb(var(--k3))"];

/** Little plates raining down. Deterministic, so server and client agree. */
export function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
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
                boxShadow: `inset 0 0 0 ${Math.round(size / 4)}px rgba(0,0,0,.12)`,
                animationDuration: `${4.5 + (i % 4) * 0.9}s`,
                animationDelay: `${-((i * 0.37) % 5)}s`,
                "--dx": `${(i % 2 ? 1 : -1) * (10 + (i % 3) * 12)}px`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
