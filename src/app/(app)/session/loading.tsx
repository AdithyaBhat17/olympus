/**
 * Instant skeleton for the live session (and Start → session). Mirrors the
 * real layout so nothing jumps when the data streams in.
 */
export default function SessionLoading() {
  return (
    <div aria-busy="true" aria-label="Opening session" className="page-top px-3">
      <div className="grid grid-cols-[44px_1fr_auto] items-center gap-2">
        <span className="w-11 h-11 rounded-full bg-surface-2" />
        <span className="flex flex-col items-center gap-1.5">
          <span className="h-3 w-36 rounded bg-surface-2" />
          <span className="flex items-center gap-2">
            <span className="w-[7px] h-[7px] rounded-full bg-accent animate-live-dot" />
            <span className="num text-[20px]">0:00</span>
          </span>
        </span>
        <span className="h-11 w-[78px] rounded-full bg-surface-2" />
      </div>
      <div className="flex gap-1 px-2 pt-4">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="h-1 flex-1 rounded-sm bg-key" />
        ))}
      </div>
      <div className="mt-3.5 p-[18px] rounded-[28px] bg-surface shadow-[inset_0_0_0_1px_#232327] flex flex-col gap-3.5">
        <span className="h-3 w-24 rounded bg-surface-3" />
        <span className="h-8 w-56 rounded-lg bg-surface-3" />
        <span className="h-11 rounded-[14px] bg-info-bg" />
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-[58px] rounded-[14px] bg-surface-2" />
          ))}
        </div>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-14 rounded-2xl bg-surface-2/60" />
        ))}
      </div>
    </div>
  );
}
