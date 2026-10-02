import "server-only";
import { db } from "@/lib/db";
import { workingWeightOverrides } from "@/lib/db/schema";
import { checkWeightJump, formatKg } from "@/domain";
import { listExercises, resolveRef } from "./exercises";
import { workingWeights } from "./history";
import { DomainError } from "./sessions";

/**
 * Audited working-weight override. More than 2 increments needs force + reason
 * (catches the 50 → 90 kg squat jump).
 */
export async function updateWorkingWeight(
  userId: string,
  input: { exerciseId: string; kg: number; reason: string; force?: boolean },
  createdBy: "claude" | "user"
) {
  const all = await listExercises(userId);
  const ex = resolveRef(all, input.exerciseId);
  if (!ex) throw new DomainError(`Unknown exercise "${input.exerciseId}"`);
  if (!input.reason?.trim()) throw new DomainError("A reason is required");
  if (!Number.isFinite(input.kg) || input.kg < 0 || input.kg > 1000) {
    throw new DomainError("Invalid kg");
  }

  const current = (await workingWeights(userId, all, { exerciseIds: [ex.id] })).get(ex.id);
  const jump = checkWeightJump(ex, current?.kg ?? null, input.kg);
  if (!jump.ok && !input.force) {
    return { ok: false as const, exercise: ex.name, previousKg: current?.kg ?? null, message: jump.message };
  }

  await db.insert(workingWeightOverrides).values({
    userId,
    exerciseId: ex.id,
    kg: input.kg.toFixed(2),
    previousKg: current?.kg != null ? current.kg.toFixed(2) : null,
    reason: input.reason.trim(),
    forced: !jump.ok,
    createdBy,
  });
  return {
    ok: true as const,
    exercise: ex.name,
    previousKg: current?.kg ?? null,
    message: `${ex.name} working weight ${current ? `${formatKg(current.kg)} → ` : ""}${formatKg(input.kg)} kg${!jump.ok ? " (forced)" : ""}.`,
  };
}
