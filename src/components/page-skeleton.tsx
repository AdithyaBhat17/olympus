/**
 * Instant placeholder for a tab while its server data streams in. Mirrors the
 * large-title header + card layout so nothing jumps on arrival.
 */
export function PageSkeleton({ title, cards = [220, 160, 120] }: { title: string; cards?: number[] }) {
  return (
    <div aria-busy="true" aria-label={`Loading ${title}`}>
      <header className="page-top px-5 pb-1 flex flex-col gap-1.5">
        <span className="h-4 w-40 rounded-full bg-surface animate-pulse" />
        <h1 className="page-title text-faint">{title}</h1>
      </header>
      {cards.map((h, i) => (
        <div
          key={i}
          className="mx-4 mt-3 rounded-[32px] bg-surface animate-pulse"
          style={{ height: h }}
        />
      ))}
    </div>
  );
}

/** Detail pages: back pill instead of a large title. */
export function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="page-top px-3">
        <span className="block h-11 w-32 rounded-full bg-surface-2" />
      </div>
      <div className="px-5 pt-5 flex flex-col gap-2">
        <span className="h-4 w-40 rounded-full bg-surface animate-pulse" />
        <span className="h-10 w-64 rounded-2xl bg-surface animate-pulse" />
      </div>
      <div className="mx-4 mt-5 h-[260px] rounded-[36px] bg-surface animate-pulse" />
      <div className="mx-4 mt-3 h-[140px] rounded-[28px] bg-surface animate-pulse" />
    </div>
  );
}
