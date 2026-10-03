import Link from "next/link";
import { auth, requireUserEmail } from "@/lib/auth";
import { formatDayShort, formatTimeInTz, todayInTz } from "@/lib/dates";
import { formatKg, isHarder, progressDelta } from "@/domain/load";
import { holdMessage } from "@/domain/recovery";
import { nextSessionType, ROTATION } from "@/domain/rotation";
import { TARGETS } from "@/domain/targets";
import { getRecovery } from "@/server/checkins";
import { getUpcomingPlan } from "@/server/plans";
import { getLiveSession, recentSessionTypes, rotationSummary } from "@/server/sessions";
import { listOpenFlags } from "@/server/flags";
import { listExercises } from "@/server/exercises";
import { workingWeights } from "@/server/history";
import { PageHeader } from "@/components/page-header";
import { RecoveryCard } from "@/components/today/recovery-card";
import { FlagsList } from "@/components/today/flags-list";
import {
  NextSessionCard,
  type NextSessionData,
  type NextSessionItem,
} from "@/components/today/next-session-card";

export const metadata = { title: "Today · Olympus" };

const PREVIEW_COUNT = 4;
/** Average time under the bar per set, on top of the planned rest. */
const SET_WORK_SEC = 40;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86_400_000);
}

export default async function TodayPage() {
  const [session, userId] = await Promise.all([auth(), requireUserEmail()]);
  const today = todayInTz();

  const [recovery, plan, live, flags, all, recentTypes, rotation] = await Promise.all([
    getRecovery(userId, today),
    getUpcomingPlan(userId),
    getLiveSession(userId),
    listOpenFlags(userId),
    listExercises(userId),
    recentSessionTypes(userId),
    rotationSummary(userId, ROTATION),
  ]);
  const byId = new Map(all.map((e) => [e.id, e]));

  // A live session that isn't this plan's (e.g. started yesterday) wins the card.
  const livePlan = live && plan && live.planId === plan.id ? plan : null;
  const showPlan = live ? livePlan : plan;
  const plannedType = live?.sessionType ?? showPlan?.sessionType ?? nextSessionType(recentTypes);

  let items: NextSessionItem[] = [];
  let more: string[] = [];
  let estMin = 0;
  if (showPlan) {
    const ids = showPlan.items.map((i) => i.exerciseId);
    const tops = await workingWeights(userId, all, { exerciseIds: ids });
    items = showPlan.items.slice(0, PREVIEW_COUNT).map((it) => {
      const ex = byId.get(it.exerciseId);
      const mode = ex?.loadMode ?? "TOTAL";
      const open = it.sets.find((s) => s.type === "working" && s.openKg != null)?.openKg ?? null;
      const lastTop = tops.get(it.exerciseId)?.kg ?? null;
      const up =
        open != null && lastTop != null && isHarder(mode, open, lastTop)
          ? `↑${formatKg(Math.abs(progressDelta(mode, lastTop, open)))}`
          : null;
      return {
        key: it.id,
        name: ex?.name ?? "Unknown exercise",
        load:
          mode === "TIME"
            ? String(it.sets.reduce((a, s) => a + s.reps[1], 0))
            : open != null
              ? formatKg(open)
              : null,
        unit: mode === "TIME" ? "min" : mode === "COUNTERWEIGHT" ? "cw" : mode === "PER_SIDE" ? "/side" : null,
        up,
        straps: it.straps,
      };
    });
    more = showPlan.items.slice(PREVIEW_COUNT).map((it) => byId.get(it.exerciseId)?.name ?? "—");
    const totalSec = showPlan.items.reduce((acc, it) => {
      // Cardio blocks are their minutes; lifting sets are work + rest.
      if (byId.get(it.exerciseId)?.loadMode === "TIME") {
        return acc + it.sets.reduce((a, s) => a + s.reps[1] * 60, 0);
      }
      return acc + it.sets.length * (it.restSec + SET_WORK_SEC);
    }, 0);
    estMin = totalSec > 0 ? Math.max(5, Math.round(totalSec / 60 / 5) * 5) : 0;
  }

  const sessions = ROTATION.map((type) => {
    const last = rotation.lastByType[type];
    const isPlanned = type === plannedType;
    let sub: string;
    if (isPlanned && showPlan) {
      sub = [
        showPlan.title,
        `${showPlan.items.length} exercise${showPlan.items.length === 1 ? "" : "s"}`,
        estMin > 0 ? `~${estMin} min` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    } else if (last) {
      sub = `${last.title} · last done ${formatDayShort(last.date)}`;
    } else {
      sub = "Not done yet";
    }
    return { type, sub, lastDone: last ? formatDayShort(last.date) : null };
  });

  const data: NextSessionData = {
    sessions,
    plannedType,
    lastType: rotation.lastType,
    hasPtPlan: !!showPlan && showPlan.source === "claude",
    planId: showPlan?.id ?? null,
    fromPtAt: showPlan?.source === "claude" ? formatTimeInTz(showPlan.pushedAt) : null,
    dayLabel: showPlan && showPlan.date !== today ? formatDayShort(showPlan.date) : null,
    warnings: showPlan?.warnings ?? [],
    items,
    more,
    live: live
      ? { href: `/session/${live.id}`, startedAt: live.startedAt?.toISOString() ?? null, type: live.sessionType }
      : null,
  };

  const who = session?.user?.name?.trim() || session?.user?.email || "?";
  const initial = who.charAt(0).toUpperCase();
  const t = recovery.today;
  const day = rotation.firstDate ? daysBetween(rotation.firstDate, today) + 1 : null;

  return (
    <div>
      <PageHeader
        eyebrow={`${formatDayShort(today)}${day ? ` · Day ${day}` : ""}`}
        title="Today"
        action={
          <Link
            href="/settings"
            aria-label="Settings"
            className="w-11 h-11 rounded-full bg-surface-2 shadow-[inset_0_0_0_1px_#2A2A2E] font-semibold flex items-center justify-center shrink-0"
          >
            {initial}
          </Link>
        }
      />

      <NextSessionCard data={data} />

      <RecoveryCard
        date={today}
        sleepMin={t?.sleepMin ?? null}
        proteinG={t?.proteinG ?? null}
        waterMl={t?.waterMl ?? null}
        targets={{ sleepMin: 7 * 60, proteinG: TARGETS.proteinG, waterMl: TARGETS.waterMl }}
        sources={t?.sources ?? {}}
        holdMessage={holdMessage(recovery.summary)}
      />

      <FlagsList flags={flags.map((f) => ({ id: f.id, text: f.text }))} />
    </div>
  );
}
