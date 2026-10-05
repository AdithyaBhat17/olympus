"use server";

import { revalidatePath } from "next/cache";
import { requireUserEmail } from "@/lib/auth";
import { revokeAllForUser } from "@/server/oauth";
import { disconnectWhoop, syncWhoop } from "@/server/integrations/whoop";
import { revokeIngestToken, rotateIngestToken } from "@/server/integrations/apple-health";
import { adoptTimezone, updateProfile, type ProfilePatch } from "@/server/profile";
import { retireConstraint, saveConstraint, type ConstraintInput } from "@/server/exercises";
import { DomainError } from "@/server/errors";

type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<R<T>> {
  try {
    const data = await fn();
    revalidatePath("/settings");
    return { ok: true, data };
  } catch (err) {
    // Rule and input problems are written for the athlete; show them as-is.
    if (err instanceof DomainError) return { ok: false, error: err.message };
    // Raw messages can carry WHOOP response bodies or DB errors; log, don't return.
    console.error(err);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

export async function disconnectClaudeAction() {
  return run(async () => revokeAllForUser(await requireUserEmail()));
}

export async function syncWhoopAction() {
  return run(async () => syncWhoop(await requireUserEmail(), 14));
}

export async function disconnectWhoopAction() {
  return run(async () => disconnectWhoop(await requireUserEmail()));
}

/** Returns the raw token once; only its hash is stored. */
export async function createHealthTokenAction() {
  return run(async () => rotateIngestToken(await requireUserEmail()));
}

export async function revokeHealthTokenAction() {
  return run(async () => revokeIngestToken(await requireUserEmail()));
}

/** Timezone, targets and rotation. Everything "today" and every gate follows these. */
export async function updateProfileAction(patch: ProfilePatch) {
  return run(async () => {
    await updateProfile(await requireUserEmail(), patch);
    revalidatePath("/", "layout");
  });
}

/** The browser's timezone, adopted once for an athlete who hasn't got one. */
export async function adoptTimezoneAction(timezone: string) {
  return run(async () => {
    const adopted = await adoptTimezone(await requireUserEmail(), String(timezone).slice(0, 64));
    if (adopted) revalidatePath("/", "layout");
    return adopted;
  });
}

export async function saveConstraintAction(input: ConstraintInput) {
  return run(async () => {
    await saveConstraint(await requireUserEmail(), input);
    revalidatePath("/exercises");
  });
}

export async function retireConstraintAction(id: string) {
  return run(async () => {
    await retireConstraint(await requireUserEmail(), String(id));
    revalidatePath("/exercises");
  });
}
