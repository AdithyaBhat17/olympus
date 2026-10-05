import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserEmail } from "@/lib/auth";
import { formatDayShort, formatDdMm, todayInTz } from "@/lib/dates";
import { listExerciseRows, toDomainExercise } from "@/server/exercises";
import { exerciseHistory, workingWeights } from "@/server/history";
import { getCheckIn } from "@/server/checkins";
import {
  TARGETS,
  estimatedOneRepMax,
  formatKg,
  isHarder,
  progressDelta,
  progressionStatus,
  topSet,
  type SetLogEntry,
} from "@/domain";
import { cn } from "@/lib/utils";
import { BackIcon } from "@/components/page-header";
import ExerciseChart, { type ChartPoint } from "@/components/progress/exercise-chart";
import WorkingWeightForm from "@/components/progress/working-weight-form";
import { isFormCueId } from "@/components/form-cues/cue-ids";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  // The list shows the most recent sessions; the chart and delta span all fetched.
  const history = fullHistory.slice(0, 12);
  const current = ww.get(ex.id) ?? null;
  const workingKg = current?.kg ?? status.workingKg;

  // Delta: oldest vs newest logged session, "↑ 10 kg, 12 wk".
  let deltaLine: { text: string; tone: "up" | "down" | "flat" } | null = null;
  const newestTop = fullHistory[0] ? topSet(ex.loadMode, fullHistory[0].sets) : null;
  if (fullHistory.length >= 2) {
    const oldestLog = fullHistory[fullHistory.length - 1];
    const oldest = topSet(ex.loadMode, oldestLog.sets);
    if (newestTop && oldest) {
      const d = progressDelta(ex.loadMode, oldest.weight, newestTop.weight);
      const wk = Math.max(
        1,
        Math.round(
          (Date.parse(`${fullHistory[0].date}T12:00:00Z`) - Date.parse(`${oldestLog.date}T12:00:00Z`)) /
            (7 * 86_400_000)
        )
      );
      deltaLine =
        d > 0
          ? { text: `↑ ${formatKg(d)} kg, ${wk} wk`, tone: "up" }
          : d < 0
            ? { text: `↓ ${formatKg(-d)} kg, ${wk} wk`, tone: "down" }
            : { text: `Holding, ${wk} wk`, tone: "flat" };
    }
  }

  // Chart series, oldest → newest (all fetched sessions; the chart picks the range).
  const points: ChartPoint[] = [...fullHistory].reverse().map((h) => ({
    date: h.date,
    top: topSet(ex.loadMode, h.sets)?.weight ?? null,
  }));

  // PR = a top set the domain flagged, else the hardest top set listed (newest wins ties).
  let bestIdx = -1;
  history.forEach((h, i) => {
    const t = topSet(ex.loadMode, h.sets);
    if (!t) return;
    const b = bestIdx >= 0 ? topSet(ex.loadMode, history[bestIdx].sets) : null;
    if (!b || isHarder(ex.loadMode, t.weight, b.weight)) bestIdx = i;
  });

  const incrementLabel = ex.isCompound
    ? `${ex.bodyRegion === "lower" ? "Lower compound" : ex.bodyRegion === "upper" ? "Upper compound" : "Compound"}, +${formatKg(status.increment)} kg`
    : "Accessory, reps first";

  const unit =
    ex.loadMode === "PER_SIDE" ? "kg/side" : ex.loadMode === "COUNTERWEIGHT" ? "kg cw" : ex.loadMode === "TIME" ? "min" : "kg";
  const e1rm = newestTop ? estimatedOneRepMax(ex.loadMode, newestTop.weight, newestTop.reps) : null;

  const eyebrow = [row.category.replace(/ — /g, ", "), sessionLabel(history[0]?.sessionType)]
    .filter(Boolean)
    .join(", ");
  const formCue = isFormCueId(row.formCueId) ? row.formCueId : null;
  const [before, after] = status.summary.includes(status.label)
    ? status.summary.split(status.label, 2)
    : [status.summary, null];

  const tile = "px-4 py-3.5 rounded-[26px] bg-surface flex flex-col gap-0.5 min-w-0";

  return (
    <div className="flex flex-col">
      <header className="page-top px-4 flex justify-between items-center">
        <Link href="/progress" aria-label="Back to Progress" className="btn-pill pl-2">
          <BackIcon />
          Progress
        </Link>
        <WorkingWeightForm exerciseId={row.id} exerciseName={row.name} currentKg={workingKg} />
      </header>

      <div className="arrive px-5 pt-5 flex flex-col gap-1.5">
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="m-0 text-[40px] font-extrabold leading-[44px] tracking-[-0.5px]">{row.name}</h1>
      </div>

      <div className="arrive arrive-1 flex items-end gap-3 px-5 pt-[18px]">
        <span className="num text-[72px] leading-[0.85] whitespace-nowrap">
          {workingKg != null ? formatKg(workingKg) : "—"}
          <span className="font-sans text-[22px] font-bold text-muted"> {unit}</span>
        </span>
        <span className="flex flex-col gap-0.5 pb-1.5 min-w-0">
          {deltaLine && (
            <span
              className={cn(
                "w-fit text-[15px] font-extrabold",
                deltaLine.tone === "up"
                  ? "h-7 px-2.5 rounded-full inline-flex items-center bg-apricot text-apricot-ink"
                  : deltaLine.tone === "down"
                    ? "text-danger-text"
                    : "text-muted"
              )}
            >
              {deltaLine.text}
            </span>
          )}
          {newestTop && (
            <span className="text-[13px] text-muted">
              Top set, {formatKg(newestTop.weight)} × {newestTop.reps}
            </span>
          )}
          {current?.source === "override" && (
            <span className="text-[13px] text-muted">Set by hand {formatDdMm(current.date)}</span>
          )}
        </span>
      </div>

      {points.some((p) => p.top != null) ? (
        <ExerciseChart points={points} today={todayInTz()} loadMode={ex.loadMode} />
      ) : (
        <section className="kind-a mx-4 mt-4 px-6 py-8 rounded-[36px] bg-k text-k-on flex flex-col gap-1">
          <span className="text-[28px] font-extrabold">Nothing to chart yet</span>
          <span className="text-[17px] opacity-90">Log {row.name} once and the chart starts here.</span>
        </section>
      )}

      <div className="arrive arrive-2 grid grid-cols-3 gap-2 mx-4 mt-3">
        <div className={tile}>
          <span className="tile-label">Est. 1RM</span>
          <span className="num text-[24px]">{e1rm != null ? formatKg(Math.round(e1rm)) : "—"}</span>
        </div>
        <div className={tile}>
          <span className="tile-label">Sessions</span>
          <span className="num text-[24px]">
            {fullHistory.length}
            {fullHistory.length >= 40 ? "+" : ""}
          </span>
        </div>
        <div className={tile}>
          <span className="tile-label">Next open</span>
          <span className="num text-[24px] text-accent">{status.nextKg != null ? formatKg(status.nextKg) : "—"}</span>
        </div>
      </div>

      <section
        aria-labelledby="bump-title"
        className="arrive arrive-3 mx-4 mt-3 p-5 rounded-[28px] bg-surface flex flex-col gap-3"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="bump-title" className="section-label m-0">
            Next bump
          </h2>
          <span className="text-[13px] text-muted text-right">{incrementLabel}</span>
        </div>
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${status.needed}, minmax(0, 1fr))` }}
          role="progressbar"
          aria-label="Clean sessions toward the next bump"
          aria-valuemin={0}
          aria-valuemax={status.needed}
          aria-valuenow={Math.min(status.hits, status.needed)}
          aria-valuetext={`${status.label} sessions`}
        >
          {Array.from({ length: status.needed }, (_, i) => (
            <div
              key={i}
              className={cn("h-3 rounded-full animate-pop-in", i < status.hits ? "bg-apricot" : "bg-surface-3")}
              style={{ animationDelay: `${200 + i * 80}ms` }}
            />
          ))}
        </div>
        <p className="m-0 text-[15px] leading-5 text-fg-2">
          {before}
          {after != null && (
            <>
              <strong className="font-semibold text-fg">{status.label}</strong>
              {after}
            </>
          )}{" "}
          <span className="text-muted">Held if sleep &lt; {TARGETS.minSleepMin / 60} h on the day.</span>
        </p>
      </section>

      {history.length > 0 && (
        <section aria-labelledby="rs-h" className="mx-4 mt-6">
          <h2 id="rs-h" className="section-label mx-1.5 mb-2.5">
            Recent sessions
          </h2>
          <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
            {history.map((h, i) => {
              const under = h.sets.some((s) => s.flags?.includes("underloaded"));
              const pr = h.sets.some((s) => s.flags?.includes("top_set_pr")) || i === bestIdx;
              return (
                <li
                  key={h.sessionId}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-[22px] bg-surface animate-rise"
                  style={{ animationDelay: `${300 + Math.min(i, 8) * 45}ms` }}
                >
                  <span className="w-[86px] shrink-0 text-[15px] font-semibold text-muted">{formatDayShort(h.date)}</span>
                  <span className="flex-1 min-w-0 num text-[15px] text-fg-2">
                    {working(h.sets)
                      .map((s) => `${formatKg(s.weight)}×${s.reps}`)
                      .join(", ")}
                  </span>
                  {pr ? (
                    <span className="h-7 px-2.5 rounded-full inline-flex items-center bg-apricot text-apricot-ink text-[13px] font-extrabold">Record</span>
                  ) : under ? (
                    <span className="num text-[17px] text-accent">
                      !<span className="sr-only"> Underloaded</span>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {formCue && (
        <Link
          href={`/form/${formCue}?ex=${row.id}`}
          className="press-soft mx-4 mt-3 h-16 px-4 rounded-[26px] bg-berry text-white flex items-center gap-3"
        >
          <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
            </svg>
          </span>
          <span className="flex-1 font-extrabold">Form cues</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      )}
    </div>
  );
}
