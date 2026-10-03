/**
 * Instant placeholder for a tab while its server data streams in. Mirrors the
 * large-title header + card layout so nothing jumps on arrival.
 */
export function PageSkeleton({ title, cards = [220, 160, 120] }: { title: string; cards?: number[] }) {
  return (
    <div aria-busy="true" aria-label={`Loading ${title}`}>
      <header className="page-top px-5 pb-1 flex flex-col gap-1.5">
        <span className="h-3 w-32 rounded bg-surface-2" />
        <h1 className="page-title text-faint">{title}</h1>
      </header>
      {cards.map((h, i) => (
        <div
          key={i}
          className="mx-3 mt-3 rounded-[24px] bg-surface shadow-[inset_0_0_0_1px_#232327]"
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
        <span className="h-3 w-40 rounded bg-surface-2" />
        <span className="h-10 w-64 rounded-lg bg-surface-2" />
      </div>
      <div className="mx-3 mt-5 h-[230px] rounded-[24px] bg-surface shadow-[inset_0_0_0_1px_#232327]" />
      <div className="mx-3 mt-2 h-[140px] rounded-[20px] bg-surface shadow-[inset_0_0_0_1px_#232327]" />
    </div>
  );
}
