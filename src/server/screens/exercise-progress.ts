import "server-only";
import { formatDayShort, todayInTz } from "@/lib/dates";
import { listExerciseRows, toDomainExercise } from "@/server/exercises";
import { exerciseHistory, workingWeights } from "@/server/history";
import { getCheckIn } from "@/server/checkins";
import { getProfile } from "@/server/profile";
import {
  estimatedOneRepMax,
  formatKg,
  isHarder,
  progressDelta,
  progressionStatus,
  topSet,
  type SetLogEntry,
} from "@/domain";
import { formatCategory } from "@/lib/utils";
import { isFormCueId } from "@/components/form-cues/cue-ids";
import type { ChartPoint } from "@/components/progress/exercise-chart";

/** "A" → "Session A"; legacy free-text names pass through. */
function sessionLabel(t: string | null | undefined): string | null {
  if (!t) return null;
  return /^[A-Z0-9]{1,2}$/.test(t) ? `Session ${t}` : t;
}

function working(sets: SetLogEntry[]): SetLogEntry[] {
  const w = sets.filter((s) => s.type !== "warmup");
  return w.length ? w : sets;
}

/** One exercise's progress page. Null when the exercise isn't visible to this user. */
export async function exerciseProgressScreen(userId: string, exerciseId: string) {
  // Only global rows and the user's own custom rows are visible.
  const rows = await listExerciseRows(userId);
  const row = rows.find((r) => r.id === exerciseId);
  if (!row) return null;
  const ex = toDomainExercise(row);

  const profile = await getProfile(userId);
  const today = todayInTz(profile.timezone);
  const { minSleepMin } = profile.targets;
  const [fullHistory, ww, checkIn] = await Promise.all([
    exerciseHistory(userId, ex.id, 40),
    workingWeights(userId, [ex], { exerciseIds: [ex.id] }),
    getCheckIn(userId, today),
  ]);
  const sleepGateFails = checkIn?.sleepMin != null && checkIn.sleepMin < minSleepMin;
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

  const eyebrow = [formatCategory(row.category), sessionLabel(history[0]?.sessionType)]
    .filter(Boolean)
    .join(", ");
  const formCue = isFormCueId(row.formCueId) ? row.formCueId : null;
  const [before, after] = status.summary.includes(status.label)
    ? status.summary.split(status.label, 2)
    : [status.summary, null];

  return {
    id: row.id,
    name: row.name,
    loadMode: ex.loadMode,
    eyebrow,
    today,
    workingKg,
    unit,
    deltaLine,
    newestTop: newestTop ? { weight: newestTop.weight, reps: newestTop.reps } : null,
    overrideDate: current?.source === "override" ? current.date : null,
    points,
    e1rm: e1rm != null ? Math.round(e1rm) : null,
    sessionCount: fullHistory.length,
    sessionCountCapped: fullHistory.length >= 40,
    nextKg: status.nextKg,
    bump: {
      needed: status.needed,
      hits: status.hits,
      label: status.label,
      before,
      after,
      incrementLabel,
      minSleepMin,
    },
    recent: history.map((h, i) => ({
      sessionId: h.sessionId,
      date: h.date,
      dateLabel: formatDayShort(h.date),
      sets: working(h.sets)
        .map((s) => `${formatKg(s.weight)}×${s.reps}`)
        .join(", "),
      record: h.sets.some((s) => s.flags?.includes("top_set_pr")) || i === bestIdx,
      underloaded: h.sets.some((s) => s.flags?.includes("underloaded")),
    })),
    formCue,
    blocked: row.userBlock != null,
    blockReason: row.userBlock?.reason ?? null,
  };
}

export type ExerciseProgressScreen = NonNullable<Awaited<ReturnType<typeof exerciseProgressScreen>>>;
