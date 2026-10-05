import type { DomainExercise, LoadMode, SetLogEntry } from "./types";

/** Round to the nearest 0.05 kg so 17.5 + 3.6 stays 21.1, not 21.099999. */
export function roundKg(kg: number): number {
  return Math.round(kg * 20) / 20;
}

/**
 * True load for a set. PER_SIDE machines (iso-lateral) report per side:
 * plates loaded on one side plus the carriage weight of that side.
 */
export function trueKg(
  ex: Pick<DomainExercise, "loadMode" | "carriageKgPerSide">,
  platesKg: number
): number {
  if (ex.loadMode === "PER_SIDE") {
    return roundKg(platesKg + (ex.carriageKgPerSide ?? 0));
  }
  return roundKg(platesKg);
}

/** Inverse of trueKg: what to load on the machine to hit a true target. */
export function platesFor(
  ex: Pick<DomainExercise, "loadMode" | "carriageKgPerSide">,
  targetTrueKg: number
): number {
  if (ex.loadMode === "PER_SIDE") {
    return roundKg(Math.max(0, targetTrueKg - (ex.carriageKgPerSide ?? 0)));
  }
  return roundKg(targetTrueKg);
}

const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25] as const;
export const BAR_KG = 20;

/** Barbell by kit, or by name when the kit isn't recorded ("Barbell Back Squat", "Deadlift"). */
export function isBarbell(ex: { name: string; equipment?: string | null }): boolean {
  return ex.equipment === "barbell" || /\bbarbell\b|deadlift/i.test(ex.name);
}

/**
 * Plates to load on one side for a true target, largest first, or null when the
 * lift isn't plate-loaded. `leftover` is the true kg standard plates can't make.
 */
export function plateBreakdown(
  ex: Pick<DomainExercise, "loadMode" | "carriageKgPerSide" | "name"> & { equipment?: string | null },
  targetTrueKg: number
): { plates: number[]; leftover: number } | null {
  let side: number;
  let sides: number;
  if (ex.loadMode === "PER_SIDE" && ex.carriageKgPerSide != null) {
    side = platesFor(ex, targetTrueKg);
    sides = 1;
  } else if (ex.loadMode === "TOTAL" && isBarbell(ex)) {
    side = (targetTrueKg - BAR_KG) / 2;
    sides = 2;
  } else {
    return null;
  }
  const plates: number[] = [];
  for (const p of PLATE_SIZES) {
    while (side + 1e-9 >= p) {
      side -= p;
      plates.push(p);
    }
  }
  return { plates, leftover: roundKg(Math.max(0, side * sides)) };
}

/** Lower counterweight = harder. Everything else: higher = harder. */
export function isHarder(mode: LoadMode, a: number, b: number): boolean {
  return mode === "COUNTERWEIGHT" ? a < b : a > b;
}

/** Positive when `next` is a progression over `prev`, in kg. */
export function progressDelta(mode: LoadMode, prev: number, next: number): number {
  return roundKg(mode === "COUNTERWEIGHT" ? prev - next : next - prev);
}

/** +2.5 for upper body, +5 for lower body. */
export function incrementFor(ex: Pick<DomainExercise, "bodyRegion">): number {
  return ex.bodyRegion === "lower" ? 5 : 2.5;
}

/** The heaviest (or for counterweight, lightest) working set. */
export function topSet(
  mode: LoadMode,
  sets: SetLogEntry[]
): SetLogEntry | null {
  const working = sets.filter((s) => s.type !== "warmup");
  const pool = working.length > 0 ? working : sets;
  let best: SetLogEntry | null = null;
  for (const s of pool) {
    if (
      !best ||
      isHarder(mode, s.weight, best.weight) ||
      (s.weight === best.weight && s.reps > best.reps)
    ) {
      best = s;
    }
  }
  return best;
}

/**
 * Estimated 1RM (Epley) from a set: kg × (1 + reps / 30). Only meaningful for
 * loads where heavier is harder; null for counterweight and timed work.
 */
export function estimatedOneRepMax(mode: LoadMode, weight: number, reps: number): number | null {
  if (mode === "COUNTERWEIGHT" || mode === "TIME" || reps <= 0 || weight <= 0) return null;
  if (reps === 1) return roundKg(weight);
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export function formatKg(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : String(roundKg(kg));
}

export const isTimed = (mode: LoadMode) => mode === "TIME";

/** "35 min" */
export function formatMinutes(min: number): string {
  return `${formatKg(min)} min`;
}

/** "47 cw", "21.1/side", "85". Cardio has no load: "—". */
export function formatLoad(mode: LoadMode, kg: number): string {
  if (mode === "TIME") return "—";
  if (mode === "COUNTERWEIGHT") return `${formatKg(kg)} cw`;
  if (mode === "PER_SIDE") return `${formatKg(kg)}/side`;
  return formatKg(kg);
}

export interface WeightJumpCheck {
  ok: boolean;
  increments: number;
  maxIncrements: number;
  message: string;
}

/**
 * Rejects working-weight edits of more than 2 increments (catches the
 * 50 → 90 kg squat jump). Caller may bypass with force + reason.
 */
export function checkWeightJump(
  ex: Pick<DomainExercise, "bodyRegion" | "name">,
  fromKg: number | null,
  toKg: number
): WeightJumpCheck {
  const inc = incrementFor(ex);
  const maxIncrements = 2;
  if (fromKg == null) {
    return { ok: true, increments: 0, maxIncrements, message: "No previous working weight." };
  }
  const increments = Math.abs(toKg - fromKg) / inc;
  const ok = increments <= maxIncrements + 1e-9;
  return {
    ok,
    increments: Math.round(increments * 10) / 10,
    maxIncrements,
    message: ok
      ? `${ex.name}: ${formatKg(fromKg)} → ${formatKg(toKg)} kg is within ${maxIncrements} increments.`
      : `${ex.name}: ${formatKg(fromKg)} → ${formatKg(toKg)} kg is ${Math.round(increments * 10) / 10} increments of ${inc} kg (max ${maxIncrements}). Pass force=true with a reason if this is real.`,
  };
}
