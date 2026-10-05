"use server";

import { revalidatePath } from "next/cache";
import { requireUserEmail } from "@/lib/auth";
import { revokeAllForUser } from "@/server/oauth";
import { disconnectWhoop, syncWhoop } from "@/server/integrations/whoop";
import { revokeIngestToken, rotateIngestToken } from "@/server/integrations/apple-health";

type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<R<T>> {
  try {
    const data = await fn();
    revalidatePath("/settings");
    return { ok: true, data };
  } catch (err) {
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
