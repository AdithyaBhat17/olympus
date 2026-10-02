import { formatKg, incrementFor, isHarder, progressDelta } from "./load";
import type {
  DomainConstraint,
  DomainExercise,
  Issue,
  PlanInput,
  PlanItemInput,
  ValidationContext,
  ValidationResult,
} from "./types";

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

/**
 * A pattern matches when every one of its words appears in the exercise name,
 * ignoring case, punctuation and plurals. "straight-bar curl" matches
 * "Barbell Curl (straight bar)"; "barbell shrug" matches "Barbell Shrugs".
 */
export function matchesPattern(name: string, pattern: string): boolean {
  const nameTokens = new Set(tokens(name));
  const patTokens = tokens(pattern);
  return patTokens.length > 0 && patTokens.every((t) => nameTokens.has(t));
}

export function blockingConstraint(
  ex: Pick<DomainExercise, "name">,
  constraints: DomainConstraint[]
): { constraint: DomainConstraint; pattern: string } | null {
  for (const c of constraints) {
    for (const p of c.blockedPatterns) {
      if (matchesPattern(ex.name, p)) return { constraint: c, pattern: p };
    }
  }
  return null;
}

/** Why an exercise is blocked for this athlete, or null if it isn't. */
export function blockedReason(
  ex: DomainExercise,
  constraints: DomainConstraint[]
): string | null {
  const hit = blockingConstraint(ex, constraints);
  if (hit) return `${hit.constraint.region}: ${hit.constraint.rule}`;
  if (ex.status === "NO") return ex.blockedReason ?? "Marked NO in the library";
  return null;
}

export function isChestPress(ex: Pick<DomainExercise, "name" | "category">): boolean {
  return (
    ex.category === "Upper Body — Push (Horizontal)" &&
    /press|bench|push[- ]?up|dip/i.test(ex.name)
  );
}

export function isTricepsIsolation(
  ex: Pick<DomainExercise, "name" | "category">
): boolean {
  if (/close grip bench|dip/i.test(ex.name)) return false;
  return /tricep|pushdown|push-down|skull|kickback|french press|overhead.*ext/i.test(
    ex.name
  );
}

function workingOpenKgs(item: PlanItemInput): number[] {
  return item.sets
    .filter((s) => s.type === "working" && typeof s.openKg === "number")
    .map((s) => s.openKg as number);
}

/** Hardest working openKg in the item (lowest for counterweight). */
function hardestOpen(ex: DomainExercise, item: PlanItemInput): number | null {
  const kgs = workingOpenKgs(item);
  if (kgs.length === 0) return null;
  return kgs.reduce((a, b) => (isHarder(ex.loadMode, b, a) ? b : a));
}

// ---------------------------------------------------------------------------
// Underload (shared by V3 and the live-session nudge)
// ---------------------------------------------------------------------------

export const UNDERLOAD_TOLERANCE = 0.15;

/** True when `kg` is more than 15% easier than the last session's top set. */
export function isUnderloaded(
  ex: Pick<DomainExercise, "loadMode">,
  kg: number,
  lastTopKg: number
): boolean {
  if (lastTopKg <= 0) return false;
  if (ex.loadMode === "COUNTERWEIGHT") {
    return kg > lastTopKg * (1 + UNDERLOAD_TOLERANCE);
  }
  return kg < lastTopKg * (1 - UNDERLOAD_TOLERANCE);
}

// ---------------------------------------------------------------------------
// V1–V10
// ---------------------------------------------------------------------------

export function validatePlan(
  plan: PlanInput,
  ctx: ValidationContext
): ValidationResult {
  const issues: Issue[] = [];
  const push = (i: Issue) => issues.push(i);

  // V10 — never overwrite a session that's already under the bar.
  if (ctx.inProgressPlanExists) {
    push({
      code: "V10",
      level: "error",
      message: `A Session ${plan.sessionType} plan for ${plan.date} is already IN_PROGRESS. Use update_plan after it finishes, or pick another date.`,
    });
  }

  const sleepGateFails =
    plan.recoveryGate != null &&
    ctx.sleepMinToday != null &&
    ctx.sleepMinToday < plan.recoveryGate.minSleepH * 60;

  const resolved: Array<{ item: PlanItemInput; ex: DomainExercise }> = [];

  for (const item of plan.items) {
    const ex = ctx.exercises.get(item.exerciseId);
    if (!ex) {
      push({
        code: "V0",
        level: "error",
        exerciseId: item.exerciseId,
        message: `Unknown exercise "${item.exerciseId}". Use search_exercises to find a valid id.`,
      });
      continue;
    }
    resolved.push({ item, ex });

    // V1 — blocked by status or by an injury constraint.
    const reason = blockedReason(ex, ctx.constraints);
    if (reason && !item.overrideReason?.trim()) {
      push({
        code: "V1",
        level: "error",
        exerciseId: ex.id,
        message: `${ex.name} is blocked (${reason}). Pick a substitute or pass overrideReason.`,
      });
    }

    // V6 — compounds need real rest.
    if (ex.isCompound && item.restSec < 150) {
      push({
        code: "V6",
        level: "warning",
        exerciseId: ex.id,
        message: `${ex.name}: ${item.restSec}s rest on a compound — this isn't a circuit. Use 180s.`,
      });
    }

    // V7 — per-side machines need a calibrated carriage.
    if (ex.loadMode === "PER_SIDE" && ex.carriageKgPerSide == null) {
      push({
        code: "V7",
        level: "warning",
        exerciseId: ex.id,
        message: `${ex.name} has no carriage weight set — calibrate carriage so true load is right.`,
      });
    }

    const lastTop = ctx.lastTopSetKg.get(ex.id);

    // V9 — nothing logged yet.
    if (lastTop == null) {
      push({
        code: "V9",
        level: "warning",
        exerciseId: ex.id,
        message: `${ex.name} has no log history — treat the first session as a calibration weight.`,
      });
      continue;
    }

    // V3 — first-set underloading pattern.
    const underloaded = item.sets.find(
      (s) =>
        s.type === "working" &&
        typeof s.openKg === "number" &&
        isUnderloaded(ex, s.openKg, lastTop)
    );
    if (underloaded) {
      push({
        code: "V3",
        level: "warning",
        exerciseId: ex.id,
        message: `${ex.name}: opening at ${formatKg(underloaded.openKg!)} kg is more than 15% off last top set (${formatKg(lastTop)} kg) — first-set underloading pattern.`,
      });
    }

    const hardest = hardestOpen(ex, item);
    if (hardest == null) continue;
    const delta = progressDelta(ex.loadMode, lastTop, hardest);

    // V8 — a higher counterweight is easier, never "progress".
    if (
      ex.loadMode === "COUNTERWEIGHT" &&
      item.progression === "increase" &&
      hardest > lastTop
    ) {
      push({
        code: "V8",
        level: "error",
        exerciseId: ex.id,
        message: `${ex.name} is counterweight-assisted: ${formatKg(lastTop)} → ${formatKg(hardest)} kg makes it easier. Progress means a LOWER number.`,
      });
    }

    if (delta > 0) {
      // V4 — no bumps on short sleep.
      if (sleepGateFails) {
        push({
          code: "V4",
          level: "warning",
          exerciseId: ex.id,
          message: `${ex.name}: load increase proposed but sleep is under ${plan.recoveryGate!.minSleepH} h — progression on hold today.`,
        });
      }

      // V5 — increments follow the rules.
      const inc = incrementFor(ex);
      if (!ex.isCompound) {
        push({
          code: "V5",
          level: "warning",
          exerciseId: ex.id,
          message: `${ex.name}: accessories add reps before load (+${formatKg(delta)} kg proposed).`,
        });
      } else if (Math.abs(delta - inc) > 0.01) {
        push({
          code: "V5",
          level: "warning",
          exerciseId: ex.id,
          message: `${ex.name}: +${formatKg(delta)} kg doesn't match the ${ex.bodyRegion ?? "upper"} compound increment (+${inc} kg).`,
        });
      }
    }
  }

  // V2 — chest press and triceps isolation can't share a pair group.
  const groups = new Map<string, DomainExercise[]>();
  for (const { item, ex } of resolved) {
    if (!item.pairGroup) continue;
    const g = groups.get(item.pairGroup) ?? [];
    g.push(ex);
    groups.set(item.pairGroup, g);
  }
  groups.forEach((members, group) => {
    const press = members.find(isChestPress);
    const tri = members.find(isTricepsIsolation);
    if (press && tri) {
      push({
        code: "V2",
        level: "error",
        exerciseId: tri.id,
        message: `Pair group "${group}" alternates ${press.name} with ${tri.name}. Alternate chest with core and run triceps last.`,
      });
    }
  });

  return {
    errors: issues.filter((i) => i.level === "error"),
    warnings: issues.filter((i) => i.level === "warning"),
  };
}
