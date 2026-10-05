/**
 * Instant skeleton for the live session (and Start → session). Mirrors the
 * colour-block hero and white set sheet so nothing jumps when the data arrives.
 */
export default function SessionLoading() {
  return (
    <div aria-busy="true" aria-label="Opening session" className="min-h-dvh flex flex-col">
      <div className="bg-accent text-accent-ink page-top px-4 pb-16">
        <div className="grid grid-cols-[44px_1fr_auto] items-center gap-2">
          <span className="w-11 h-11 rounded-full bg-white/20" />
          <span className="flex flex-col items-center gap-1.5">
            <span className="h-3 w-28 rounded-full bg-white/30" />
            <span className="num text-[20px]">0:00</span>
          </span>
          <span className="h-11 w-[78px] rounded-full bg-white/20" />
        </div>
        <div className="flex gap-1 pt-4">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="h-1.5 flex-1 rounded-full bg-white/25" />
          ))}
        </div>
        <span className="mt-5 block h-8 w-56 rounded-2xl bg-white/25 animate-pulse" />
        <span className="mt-3 block h-20 w-40 rounded-3xl bg-white/25 animate-pulse" />
      </div>
      <div className="-mt-9 flex-1 rounded-t-[40px] bg-bg px-4 pt-6 flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-14 rounded-[26px] bg-surface animate-pulse" />
        ))}
      </div>
    </div>
  );
}
