import "server-only";
import { formatDayShort, formatTimeInTz, todayInTz } from "@/lib/dates";
import { formatKg, isHarder, progressDelta } from "@/domain/load";
import { holdMessage } from "@/domain/recovery";
import { nextSessionType } from "@/domain/rotation";
import { getRecovery } from "@/server/checkins";
import { getUpcomingPlan } from "@/server/plans";
import { getLiveSession, recentSessionTypes, rotationSummary } from "@/server/sessions";
import { listOpenFlags } from "@/server/flags";
import { listExercises } from "@/server/exercises";
import { workingWeights } from "@/server/history";
import { getProfile } from "@/server/profile";
import { loadWithUnit, openKg, plannedMinutes, shortClock, targetLabel, targetRpe } from "@/components/session/format";
import type { NextSessionData, NextSessionItem, Workout, WorkoutItem } from "@/components/today/next-session-card";

const PREVIEW_COUNT = 4;
/** Average time under the bar per set, on top of the planned rest. */
const SET_WORK_SEC = 40;

/** Everything the Today screen shows. Shared by the web page and GET /api/v1/today. */
export async function todayScreen(userId: string) {
  const profile = await getProfile(userId);
  const today = todayInTz(profile.timezone);

  const [recovery, plan, live, flags, all, recentTypes, rotation] = await Promise.all([
    getRecovery(userId, today),
    getUpcomingPlan(userId),
    getLiveSession(userId),
    listOpenFlags(userId),
    listExercises(userId),
    recentSessionTypes(userId),
    rotationSummary(userId, profile.rotation),
  ]);
  const byId = new Map(all.map((e) => [e.id, e]));

  // A live session that isn't this plan's (e.g. started yesterday) wins the card.
  const livePlan = live && plan && live.planId === plan.id ? plan : null;
  const showPlan = live ? livePlan : plan;
  const plannedType =
    live?.sessionType ?? showPlan?.sessionType ?? nextSessionType(recentTypes, profile.rotation);

  let items: NextSessionItem[] = [];
  let more: string[] = [];
  let workout: Workout | null = null;
  let estMin = 0;
  if (showPlan) {
    const ids = showPlan.items.map((i) => i.exerciseId);
    const tops = await workingWeights(userId, all, { exerciseIds: ids });
    // One pass: each plan item as the live screen's shape, so format.ts reads it the same way.
    const rows = showPlan.items.map((it) => {
      const ex = byId.get(it.exerciseId);
      const mode = ex?.loadMode ?? "TOTAL";
      const view = { sets: it.sets.map((planned) => ({ planned })), exercise: { loadMode: mode } };
      return { it, mode, view, name: ex?.name ?? "Unknown exercise", open: openKg(view) };
    });
    items = rows.slice(0, PREVIEW_COUNT).map(({ it, mode, name, open }) => {
      const lastTop = tops.get(it.exerciseId)?.kg ?? null;
      const up =
        open != null && lastTop != null && isHarder(mode, open, lastTop)
          ? `↑${formatKg(Math.abs(progressDelta(mode, lastTop, open)))}`
          : null;
      return {
        key: it.id,
        name,
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
    // Kept alongside `workout` for iOS builds that predate it.
    more = rows.slice(PREVIEW_COUNT).map((r) => r.name);
    workout = {
      title: showPlan.title,
      coachNotes: showPlan.coachNotes,
      items: rows.map(({ it, mode, view, name, open }): WorkoutItem => {
        const timed = mode === "TIME";
        const warmups = it.sets.filter((s) => s.type === "warmup").length;
        const rpe = targetRpe(view);
        const sets = timed
          ? plannedMinutes(view)?.label ?? ""
          : [warmups > 0 ? `${warmups} warm-up` : null, targetLabel(view), rpe != null ? `RPE ${rpe}` : null]
              .filter(Boolean)
              .join(", ");
        return {
          key: it.id,
          name,
          sets,
          load: !timed && open != null ? loadWithUnit(mode, open) : null,
          rest: !timed && it.restSec > 0 ? `${shortClock(it.restSec)} rest` : null,
          pair: it.pairGroup,
          straps: it.straps,
          cues: it.cues,
        };
      }),
    };
    const totalSec = rows.reduce((acc, { it, mode }) => {
      // Cardio blocks are their minutes; lifting sets are work + rest.
      if (mode === "TIME") return acc + it.sets.reduce((a, s) => a + s.reps[1] * 60, 0);
      return acc + it.sets.length * (it.restSec + SET_WORK_SEC);
    }, 0);
    estMin = totalSec > 0 ? Math.max(5, Math.round(totalSec / 60 / 5) * 5) : 0;
  }

  const sessions = profile.rotation.map((type) => {
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
        .join(", ");
    } else if (last) {
      sub = `${last.title}, last done ${formatDayShort(last.date)}`;
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
    fromPtAt: showPlan?.source === "claude" ? formatTimeInTz(showPlan.pushedAt, profile.timezone) : null,
    dayLabel: showPlan && showPlan.date !== today ? formatDayShort(showPlan.date) : null,
    warnings: showPlan?.warnings ?? [],
    items,
    more,
    workout,
    live: live
      ? {
          id: live.id,
          href: `/session/${live.id}`,
          startedAt: live.startedAt?.toISOString() ?? null,
          type: live.sessionType,
        }
      : null,
  };

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86_400_000);
}

  const t = recovery.today;
  const day = rotation.firstDate ? daysBetween(rotation.firstDate, today) + 1 : null;

  return {
    today,
    eyebrow: `${formatDayShort(today)}${day ? `, Day ${day}` : ""}`,
    next: data,
    recovery: {
      date: today,
      sleepMin: t?.sleepMin ?? null,
      proteinG: t?.proteinG ?? null,
      waterMl: t?.waterMl ?? null,
      hrvMs: t?.hrvMs ?? null,
      restingHr: t?.restingHr ?? null,
      targets: {
        // The bubble fills toward an hour past the floor; "short" is under the floor.
        sleepMin: profile.targets.minSleepMin + 60,
        minSleepMin: profile.targets.minSleepMin,
        proteinG: profile.targets.proteinG,
        waterMl: profile.targets.waterMl,
      },
      sources: t?.sources ?? {},
      holdMessage: holdMessage(recovery.summary),
    },
    flags: flags.map((f) => ({ id: f.id, text: f.text })),
  };
}

export type TodayScreen = Awaited<ReturnType<typeof todayScreen>>;
