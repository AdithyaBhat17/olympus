import "server-only";
import { todayInTz } from "@/lib/dates";
import { blockedReason, gateMessage, nextSessionType, TARGETS } from "@/domain";
import { exerciseRef, getConstraints, listExercises } from "./exercises";
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

  const lifts = Array.from(ww.entries())
    .map(([id, w]) => {
      const ex = byId.get(id);
      const reason = ex ? blockedReason(ex, cons) : null;
      return {
        exerciseId: ex ? exerciseRef(ex) : id,
        exerciseUuid: id,
        name: ex?.name ?? id,
        loadMode: ex?.loadMode ?? "TOTAL",
        kg: w.kg,
        asOf: w.date,
        source: w.source,
        blocked: reason != null,
        blockedReason: reason,
      };
    })
    .filter((l) => l.loadMode !== "TIME")
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    today: todayInTz(),
    constraints: cons,
    // Only lifts Claude may programme. Blocked ones are listed separately so a
    // retired movement's last load can never be mistaken for a current one.
    workingWeights: lifts
      .filter((l) => !l.blocked)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ blocked, blockedReason, ...l }) => l),
    blockedLifts: lifts
      .filter((l) => l.blocked)
      .map((l) => ({
        exerciseId: l.exerciseId,
        exerciseUuid: l.exerciseUuid,
        name: l.name,
        lastKg: l.kg,
        asOf: l.asOf,
        reason: l.blockedReason,
      })),
    rotation: {
      last: types[0] ?? null,
      recent: types.slice(0, 6),
      nextDue: nextSessionType(types),
    },
    openCoachFlags: flags.map((f) => {
      // Exercise-scoped flags carry the same ids as workingWeights.
      const ex = f.scope === "exerciseId" && f.scopeValue ? byId.get(f.scopeValue) : undefined;
      return {
        id: f.id,
        text: f.text,
        scope: f.scope,
        ...(f.scope === "exerciseId"
          ? {
              exerciseId: ex ? exerciseRef(ex) : f.scopeValue,
              exerciseUuid: f.scopeValue,
              exercise: ex?.name ?? null,
            }
          : f.scope === "sessionType"
            ? { sessionType: f.scopeValue }
            : {}),
        createdBy: f.createdBy,
      };
    }),
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
    // clear | hold | unknown — unknown means nobody logged sleep: ask, don't assume.
    progressionGate: recovery.summary.gate,
    progressionGateMessage: gateMessage(recovery.summary),
    progressionOnHold: recovery.summary.gate === "unknown" ? null : recovery.summary.progressionOnHold,
    nutritionTargets: {
      kcal: TARGETS.kcal,
      proteinFloorG: TARGETS.proteinG,
      waterMl: TARGETS.waterMl,
    },
  };
}
