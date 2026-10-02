import "server-only";
import { todayInTz } from "@/lib/dates";
import { nextSessionType, TARGETS } from "@/domain";
import { getConstraints, listExercises } from "./exercises";
import { workingWeights } from "./history";
import { listOpenFlags } from "./flags";
import { getRecovery } from "./checkins";
import { recentSessionTypes } from "./sessions";
import { getUpcomingPlan } from "./plans";

/** Everything Claude needs before programming a session. */
export async function getAthleteContext(userId: string) {
  const all = await listExercises(userId);
  const byId = new Map(all.map((e) => [e.id, e]));
  const [cons, ww, flags, types, recovery, upcoming] = await Promise.all([
    getConstraints(userId),
    workingWeights(userId, all),
    listOpenFlags(userId),
    recentSessionTypes(userId),
    getRecovery(userId, todayInTz(), 7),
    getUpcomingPlan(userId),
  ]);

  return {
    today: todayInTz(),
    constraints: cons,
    workingWeights: Array.from(ww.entries())
      .map(([id, w]) => {
        const ex = byId.get(id);
        return {
          exerciseId: ex?.slug ?? id,
          name: ex?.name ?? id,
          loadMode: ex?.loadMode ?? "TOTAL",
          kg: w.kg,
          asOf: w.date,
          source: w.source,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    rotation: {
      last: types[0] ?? null,
      recent: types.slice(0, 6),
      nextDue: nextSessionType(types),
    },
    openCoachFlags: flags.map((f) => ({
      id: f.id,
      text: f.text,
      scope: f.scope,
      scopeValue: f.scopeValue,
      createdBy: f.createdBy,
    })),
    upcomingPlan: upcoming
      ? {
          planId: upcoming.id,
          date: upcoming.date,
          sessionType: upcoming.sessionType,
          title: upcoming.title,
          status: upcoming.status,
          clientRef: upcoming.clientRef,
        }
      : null,
    recoveryToday: recovery.today
      ? {
          sleepMin: recovery.today.sleepMin,
          proteinG: recovery.today.proteinG,
          waterMl: recovery.today.waterMl,
          sources: recovery.today.sources,
        }
      : null,
    recoveryStreaks: recovery.summary.streaks,
    progressionOnHold: recovery.summary.progressionOnHold,
    nutritionTargets: {
      kcal: TARGETS.kcal,
      proteinFloorG: TARGETS.proteinG,
      waterMl: TARGETS.waterMl,
    },
  };
}
