import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserEmail } from "@/lib/auth";
import { formatDdMm } from "@/lib/dates";
import { listExerciseRows } from "@/server/exercises";
import { exerciseProgressScreen } from "@/server/screens/exercise-progress";
import { formatHours, formatKg } from "@/domain";
import { cn } from "@/lib/utils";
import { BackIcon } from "@/components/page-header";
import ExerciseChart from "@/components/progress/exercise-chart";
import WorkingWeightForm from "@/components/progress/working-weight-form";
import BlockToggle from "@/components/progress/block-toggle";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const s = await exerciseProgressScreen(await requireUserEmail(), exerciseId);
  if (!s) notFound();

  const tile = "px-4 py-3.5 rounded-[26px] bg-surface flex flex-col gap-0.5 min-w-0";

  return (
    <div className="flex flex-col">
      <header className="page-top px-4 flex justify-between items-center">
        <Link href="/progress" aria-label="Back to Progress" className="btn-pill pl-2">
          <BackIcon />
          Progress
        </Link>
        <WorkingWeightForm exerciseId={s.id} exerciseName={s.name} currentKg={s.workingKg} />
      </header>

      <div className="arrive px-5 pt-5 flex flex-col gap-1.5">
        <span className="eyebrow">{s.eyebrow}</span>
        <h1 className="m-0 text-[40px] font-extrabold leading-[44px] tracking-[-0.5px]">{s.name}</h1>
      </div>

      <div className="arrive arrive-1 flex items-end gap-3 px-5 pt-[18px]">
        <span className="num text-[72px] leading-[0.85] whitespace-nowrap">
          {s.workingKg != null ? formatKg(s.workingKg) : "—"}
          <span className="font-sans text-[22px] font-bold text-muted"> {s.unit}</span>
        </span>
        <span className="flex flex-col gap-0.5 pb-1.5 min-w-0">
          {s.deltaLine && (
            <span
              className={cn(
                "w-fit text-[15px] font-extrabold",
                s.deltaLine.tone === "up"
                  ? "tag tag-apricot text-[15px]"
                  : s.deltaLine.tone === "down"
                    ? "text-danger-text"
                    : "text-muted"
              )}
            >
              {s.deltaLine.text}
            </span>
          )}
          {s.newestTop && (
            <span className="text-[13px] text-muted">
              Top set, {formatKg(s.newestTop.weight)} × {s.newestTop.reps}
            </span>
          )}
          {s.overrideDate && (
            <span className="text-[13px] text-muted">Set by hand {formatDdMm(s.overrideDate)}</span>
          )}
        </span>
      </div>

      {s.points.some((p) => p.top != null) ? (
        <ExerciseChart points={s.points} today={s.today} loadMode={s.loadMode} />
      ) : (
        <section className="kind-accent mx-4 mt-4 px-6 py-8 rounded-[36px] bg-k text-k-on flex flex-col gap-1">
          <span className="text-[28px] font-extrabold">Nothing to chart yet</span>
          <span className="text-[17px] opacity-90">Log {s.name} once and the chart starts here.</span>
        </section>
      )}

      <div className="arrive arrive-2 grid grid-cols-3 gap-2 mx-4 mt-3">
        <div className={tile}>
          <span className="tile-label">Est. 1RM</span>
          <span className="num text-[24px]">{s.e1rm != null ? formatKg(s.e1rm) : "—"}</span>
        </div>
        <div className={tile}>
          <span className="tile-label">Sessions</span>
          <span className="num text-[24px]">
            {s.sessionCount}
            {s.sessionCountCapped ? "+" : ""}
          </span>
        </div>
        <div className={tile}>
          <span className="tile-label">Next open</span>
          <span className="num text-[24px] text-accent">{s.nextKg != null ? formatKg(s.nextKg) : "—"}</span>
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
          <span className="text-[13px] text-muted text-right">{s.bump.incrementLabel}</span>
        </div>
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${s.bump.needed}, minmax(0, 1fr))` }}
          role="progressbar"
          aria-label="Clean sessions toward the next bump"
          aria-valuemin={0}
          aria-valuemax={s.bump.needed}
          aria-valuenow={Math.min(s.bump.hits, s.bump.needed)}
          aria-valuetext={`${s.bump.label} sessions`}
        >
          {Array.from({ length: s.bump.needed }, (_, i) => (
            <div
              key={i}
              className={cn("h-3 rounded-full animate-pop-in", i < s.bump.hits ? "bg-apricot" : "bg-surface-3")}
              style={{ animationDelay: `${200 + i * 80}ms` }}
            />
          ))}
        </div>
        <p className="m-0 text-[15px] leading-5 text-fg-2">
          {s.bump.before}
          {s.bump.after != null && (
            <>
              <strong className="font-semibold text-fg">{s.bump.label}</strong>
              {s.bump.after}
            </>
          )}{" "}
          <span className="text-muted">Held if sleep &lt; {formatHours(s.bump.minSleepMin)} h on the day.</span>
        </p>
      </section>

      {s.recent.length > 0 && (
        <section aria-labelledby="rs-h" className="mx-4 mt-6">
          <h2 id="rs-h" className="section-label mx-1.5 mb-2.5">
            Recent sessions
          </h2>
          <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
            {s.recent.map((h, i) => {
              return (
                <li
                  key={h.sessionId}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-[22px] bg-surface animate-rise"
                  style={{ animationDelay: `${300 + Math.min(i, 8) * 45}ms` }}
                >
                  <span className="w-[86px] shrink-0 text-[15px] font-semibold text-muted">{h.dateLabel}</span>
                  <span className="flex-1 min-w-0 num text-[15px] text-fg-2">
                    {h.sets}
                  </span>
                  {h.record ? (
                    <span className="tag tag-apricot">Record</span>
                  ) : h.underloaded ? (
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

      {s.formCue && (
        <Link
          href={`/form/${s.formCue}?ex=${s.id}`}
          className="press-soft mx-4 mt-3 h-16 px-4 rounded-[26px] bg-info text-white flex items-center gap-3"
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

      <BlockToggle exerciseId={s.id} name={s.name} blocked={s.blocked} reason={s.blockReason} />
    </div>
  );
}
