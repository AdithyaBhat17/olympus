import Link from "next/link";
import { auth, requireUserEmail } from "@/lib/auth";
import { formatDayShort, formatTimeInTz, todayInTz } from "@/lib/dates";
import { formatKg, formatLoad, isHarder, progressDelta } from "@/domain/load";
import { holdMessage } from "@/domain/recovery";
import { nextSessionType, ROTATION } from "@/domain/rotation";
import { getRecovery } from "@/server/checkins";
import { getUpcomingPlan } from "@/server/plans";
import { getLiveSession, recentSessionTypes } from "@/server/sessions";
import { listOpenFlags } from "@/server/flags";
import { listExercises } from "@/server/exercises";
import { workingWeights } from "@/server/history";
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

export default async function TodayPage() {
  const [session, userId] = await Promise.all([auth(), requireUserEmail()]);
  const today = todayInTz();

  const [recovery, plan, live, flags, all, recentTypes] = await Promise.all([
    getRecovery(userId, today),
    getUpcomingPlan(userId),
    getLiveSession(userId),
    listOpenFlags(userId),
    listExercises(userId),
    recentSessionTypes(userId),
  ]);
  const byId = new Map(all.map((e) => [e.id, e]));

  // A live session that isn't this plan's (e.g. started yesterday) wins the card.
  const livePlan = live && plan && live.planId === plan.id ? plan : null;
  const showPlan = live ? livePlan : plan;

  let data: NextSessionData;
  if (showPlan) {
    const ids = showPlan.items.map((i) => i.exerciseId);
    const tops = await workingWeights(userId, all, { exerciseIds: ids });
    const items: NextSessionItem[] = showPlan.items.slice(0, PREVIEW_COUNT).map((it) => {
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
            ? `${it.sets.reduce((a, s) => a + s.reps[1], 0)} min`
            : open != null
              ? formatLoad(mode, open)
              : null,
        up,
        straps: it.straps,
      };
    });
    const totalSec = showPlan.items.reduce((acc, it) => {
      // Cardio blocks are their minutes; lifting sets are work + rest.
      if (byId.get(it.exerciseId)?.loadMode === "TIME") {
        return acc + it.sets.reduce((a, s) => a + s.reps[1] * 60, 0);
      }
      return acc + it.sets.length * (it.restSec + SET_WORK_SEC);
    }, 0);
    data = {
      sessionType: showPlan.sessionType,
      rotation: ROTATION,
      title: showPlan.title,
      exerciseCount: showPlan.items.length,
      estMin: totalSec > 0 ? Math.max(5, Math.round(totalSec / 60 / 5) * 5) : 0,
      fromPtAt: showPlan.source === "claude" ? formatTimeInTz(showPlan.pushedAt) : null,
      dayLabel: showPlan.date !== today ? formatDayShort(showPlan.date) : null,
      warnings: showPlan.warnings ?? [],
      items,
      more: showPlan.items.slice(PREVIEW_COUNT).map((it) => byId.get(it.exerciseId)?.name ?? "—"),
      cta: live
        ? { kind: "resume", href: `/session/${live.id}` }
        : { kind: "plan", planId: showPlan.id },
    };
  } else {
    const type = live?.sessionType ?? nextSessionType(recentTypes);
    data = {
      sessionType: type,
      rotation: ROTATION,
      title: live ? live.sessionName.replace(/^Session \S+ · /, "") : null,
      exerciseCount: 0,
      estMin: 0,
      fromPtAt: null,
      dayLabel: live && live.date !== today ? formatDayShort(live.date) : null,
      warnings: [],
      items: [],
      more: [],
      cta: live ? { kind: "resume", href: `/session/${live.id}` } : { kind: "rotation" },
    };
  }

  const who = session?.user?.name?.trim() || session?.user?.email || "?";
  const initial = who.charAt(0).toUpperCase();
  const t = recovery.today;

  return (
    <div className="pb-6">
      <header className="pt-[calc(env(safe-area-inset-top,0px)_+_1.5rem)] px-5 pb-2 flex justify-between items-end">
        <div className="flex flex-col gap-0.5">
          <div className="text-[13px] text-muted tracking-[0.06em] uppercase">{formatDayShort(today)}</div>
          <h1 className="m-0 font-display font-bold text-[44px] leading-none">Today</h1>
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="w-11 h-11 rounded-full border border-line bg-surface font-semibold flex items-center justify-center"
        >
          {initial}
        </Link>
      </header>

      <RecoveryCard
        date={today}
        sleepMin={t?.sleepMin ?? null}
        proteinG={t?.proteinG ?? null}
        waterMl={t?.waterMl ?? null}
        sources={t?.sources ?? {}}
        holdMessage={holdMessage(recovery.summary)}
      />

      <NextSessionCard data={data} />

      <FlagsList flags={flags.map((f) => ({ id: f.id, text: f.text }))} />
    </div>
  );
}
