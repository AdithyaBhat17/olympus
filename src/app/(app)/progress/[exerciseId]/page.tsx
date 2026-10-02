import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserEmail } from "@/lib/auth";
import { formatDdMm, todayInTz } from "@/lib/dates";
import { listExerciseRows, toDomainExercise } from "@/server/exercises";
import { exerciseHistory, workingWeights } from "@/server/history";
import { getCheckIn } from "@/server/checkins";
import {
  TARGETS,
  formatKg,
  isHarder,
  progressDelta,
  progressionStatus,
  topSet,
  type SetLogEntry,
} from "@/domain";
import { cn } from "@/lib/utils";
import ExerciseChart, { type ChartPoint } from "@/components/progress/exercise-chart";
import WorkingWeightForm from "@/components/progress/working-weight-form";
import { isFormCueId } from "@/components/form-cues/cue-ids";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEADER_PAD = "pt-[max(52px,calc(env(safe-area-inset-top)_+_8px))]";

/** "A" → "Session A"; legacy free-text names pass through. */
function sessionLabel(t: string | null | undefined): string | null {
  if (!t) return null;
  return /^[A-Z0-9]{1,2}$/.test(t) ? `Session ${t}` : t;
}

function working(sets: SetLogEntry[]): SetLogEntry[] {
  const w = sets.filter((s) => s.type !== "warmup");
  return w.length ? w : sets;
}

export async function generateMetadata({ params }: { params: Promise<{ exerciseId: string }> }) {
  const { exerciseId } = await params;
  if (!UUID_RE.test(exerciseId)) return { title: "Progress" };
  const userId = await requireUserEmail();
  const row = (await listExerciseRows(userId)).find((r) => r.id === exerciseId);
  return { title: row ? row.name : "Progress" };
}

export default async function ExerciseProgressPage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;
  if (!UUID_RE.test(exerciseId)) notFound();
  const userId = await requireUserEmail();

  // Only global rows and the user's own custom rows are visible.
  const rows = await listExerciseRows(userId);
  const row = rows.find((r) => r.id === exerciseId);
  if (!row) notFound();
  const ex = toDomainExercise(row);

  const [fullHistory, ww, checkIn] = await Promise.all([
    exerciseHistory(userId, ex.id, 40),
    workingWeights(userId, [ex], { exerciseIds: [ex.id] }),
    getCheckIn(userId, todayInTz()),
  ]);
  const sleepGateFails = checkIn?.sleepMin != null && checkIn.sleepMin < TARGETS.minSleepMin;
  const status = progressionStatus(ex, fullHistory, { sleepGateFails });
  // Chart and list show the most recent sessions; the delta line spans all fetched.
  const history = fullHistory.slice(0, 12);
  const current = ww.get(ex.id) ?? null;
  const workingKg = current?.kg ?? status.workingKg;

  // Delta line: oldest vs newest logged session.
  let deltaLine: { text: string; tone: "up" | "down" | "flat" } | null = null;
  if (fullHistory.length >= 2) {
    const newest = topSet(ex.loadMode, fullHistory[0].sets);
    const oldestLog = fullHistory[fullHistory.length - 1];
    const oldest = topSet(ex.loadMode, oldestLog.sets);
    const opener = working(oldestLog.sets)[0];
    if (newest && oldest) {
      const d = progressDelta(ex.loadMode, oldest.weight, newest.weight);
      const since = formatDdMm(oldestLog.date);
      const was = opener ? ` · was opening at ${formatKg(opener.weight)} for ${opener.reps} reps` : "";
      deltaLine =
        d > 0
          ? { text: `↑ ${formatKg(d)} kg since ${since}${was}`, tone: "up" }
          : d < 0
            ? { text: `↓ ${formatKg(-d)} kg since ${since}${was}`, tone: "down" }
            : { text: `Holding since ${since}${was}`, tone: "flat" };
    }
  }

  // Chart series, oldest → newest.
  const points: ChartPoint[] = [...history].reverse().map((h) => {
    const w = working(h.sets);
    const top = topSet(ex.loadMode, h.sets);
    const rpes = w.map((s) => s.rpe).filter((r): r is number => r != null);
    return {
      date: h.date,
      top: top?.weight ?? null,
      volume: Math.round(w.reduce((a, s) => a + s.weight * s.reps, 0)),
      rpe: rpes.length ? Math.max(...rpes) : null,
    };
  });

  // "Best" = hardest top set across the listed sessions (newest wins ties).
  let bestIdx = -1;
  history.forEach((h, i) => {
    const t = topSet(ex.loadMode, h.sets);
    if (!t) return;
    const b = bestIdx >= 0 ? topSet(ex.loadMode, history[bestIdx].sets) : null;
    if (!b || isHarder(ex.loadMode, t.weight, b.weight)) bestIdx = i;
  });

  const incrementLabel = ex.isCompound
    ? `${ex.bodyRegion === "lower" ? "Lower compound" : ex.bodyRegion === "upper" ? "Upper compound" : "Compound"} · +${formatKg(status.increment)} kg`
    : "Accessory · reps first";

  const unit =
    ex.loadMode === "PER_SIDE"
      ? "kg/side working weight"
      : ex.loadMode === "COUNTERWEIGHT"
        ? "kg counterweight"
        : "kg working weight";

  const eyebrow = [row.category, sessionLabel(history[0]?.sessionType)].filter(Boolean).join(" · ");
  const formCue = isFormCueId(row.formCueId) ? row.formCueId : null;
  const [before, after] = status.summary.includes(status.label)
    ? status.summary.split(status.label, 2)
    : [status.summary, null];

  return (
    <div className="flex flex-col pb-8">
      <header className={cn("px-4 pb-2 flex items-center gap-2", HEADER_PAD)}>
        <Link
          href="/progress"
          aria-label="Back to progress"
          className="w-11 h-11 -ml-1 flex items-center justify-center rounded-xl text-fg hover:bg-surface shrink-0"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <span className="text-[13px] text-muted truncate">{eyebrow}</span>
      </header>

      <section className="px-5 flex flex-col gap-1.5">
        <h1 className="font-display font-bold text-[38px] leading-none">{row.name}</h1>
        <div className="flex items-baseline gap-2.5 mt-2">
          <span className="font-display font-bold text-[64px] leading-none tabular-nums">
            {workingKg != null ? formatKg(workingKg) : "—"}
          </span>
          <span className="text-base text-muted">{unit}</span>
        </div>
        {current?.source === "override" && (
          <span className="text-[13px] text-muted">Set by hand on {formatDdMm(current.date)}</span>
        )}
        {deltaLine && (
          <span
            className={cn(
              "text-sm",
              deltaLine.tone === "up" ? "text-info" : deltaLine.tone === "down" ? "text-danger-soft" : "text-muted"
            )}
          >
            {deltaLine.text}
          </span>
        )}
      </section>

      {points.length > 0 ? (
        <ExerciseChart
          points={points}
          nextKg={status.nextKg}
          loadMode={ex.loadMode}
        />
      ) : (
        <section className="card mx-4 mt-5 flex flex-col gap-1">
          <span className="font-semibold">No sessions logged yet</span>
          <span className="text-sm text-muted">Log {row.name} once and the chart starts here.</span>
        </section>
      )}

      <section aria-labelledby="bump-title" className="card mx-4 mt-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="bump-title" className="eyebrow">
            Next bump
          </h2>
          <span className="text-[13px] text-muted text-right">{incrementLabel}</span>
        </div>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${status.needed}, minmax(0, 1fr))` }}
          role="progressbar"
          aria-label="Clean sessions toward the next bump"
          aria-valuemin={0}
          aria-valuemax={status.needed}
          aria-valuenow={Math.min(status.hits, status.needed)}
          aria-valuetext={`${status.label} sessions`}
        >
          {Array.from({ length: status.needed }, (_, i) => (
            <div key={i} className={cn("h-2.5 rounded-[5px]", i < status.hits ? "bg-info" : "bg-line")} />
          ))}
        </div>
        <p className="text-sm leading-[1.45]">
          {before}
          {after != null && (
            <>
              <strong className="font-semibold">{status.label}</strong>
              {after}
            </>
          )}
        </p>
        <span className="text-[13px] text-danger-soft">
          Held if sleep &lt; {TARGETS.minSleepMin / 60} h on the day.
        </span>
      </section>

      {history.length > 0 && (
        <section aria-labelledby="history-title" className="mx-4 mt-5 flex flex-col">
          <h2 id="history-title" className="eyebrow mb-2">
            History
          </h2>
          <ul className="flex flex-col">
            {history.map((h, i) => {
              const under = h.sets.find((s) => s.flags?.includes("underloaded"));
              const label = sessionLabel(h.sessionType);
              return (
                <li key={h.sessionId} className="py-3.5 border-b border-line-soft flex flex-col gap-2">
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold">
                      {formatDdMm(h.date)}
                      {label && ` · ${label}`}
                    </span>
                    {under ? (
                      <span className="text-[13px] text-danger-soft shrink-0">
                        Underloaded{under.rpe != null && ` · RPE ${formatKg(under.rpe)}`}
                      </span>
                    ) : i === bestIdx ? (
                      <span className="text-[13px] text-info shrink-0">Best</span>
                    ) : null}
                  </div>
                  <ul className="flex flex-wrap gap-2" aria-label="Sets">
                    {h.sets.map((s, j) => (
                      <li
                        key={j}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg bg-surface-2 font-display text-lg leading-tight tabular-nums",
                          (under || s.type === "warmup") && "text-muted"
                        )}
                      >
                        {formatKg(s.weight)} × {s.reps}
                        {s.type === "warmup" && <span className="sr-only"> (warm-up)</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mx-4 mt-5 grid grid-cols-2 gap-2">
        {formCue ? (
          <Link href={`/form/${formCue}?ex=${row.id}`} className="btn-secondary bg-transparent">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M10 8l6 4-6 4z" />
            </svg>
            Form cues
          </Link>
        ) : null}
        <WorkingWeightForm
          exerciseId={row.id}
          exerciseName={row.name}
          currentKg={workingKg}
          className={formCue ? undefined : "col-span-2"}
        />
      </section>
    </div>
  );
}
