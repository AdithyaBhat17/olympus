import { z } from "zod";
import { body, isoDate, route } from "@/server/api";
import { DomainError } from "@/server/errors";
import { connectGarmin, disconnectGarmin, garminConfigured, syncGarmin } from "@/server/integrations/garmin/sync";

const connect = z.object({
  apiKey: z.string().trim().min(1).max(500),
  /** The expiry date Garmin Connect shows for the key. */
  expiresOn: isoDate,
});

/** Connect (or replace the key), then pull the last 90 days. Same rules as the web's connectGarminAction. */
export const PUT = route(async ({ req, userId }) => {
  if (!garminConfigured()) throw new DomainError("Garmin isn't set up on the server (GARMIN_SECRET_KEY missing).");
  const { apiKey, expiresOn } = await body(req, connect);
  const expiresAt = new Date(`${expiresOn}T23:59:59Z`);
  if (expiresAt.getTime() < Date.now()) throw new DomainError("That expiry date has passed.");
  try {
    await connectGarmin(userId, apiKey, expiresAt);
  } catch (err) {
    // connectGarmin's own messages are written for the athlete.
    if (err instanceof Error && /Garmin rejected|doesn't look like/.test(err.message)) throw new DomainError(err.message);
    throw err;
  }
  return { days: (await syncGarmin(userId, { days: 90 }))?.days ?? 0 };
});

/** Sync the last 14 days now. */
export const POST = route(async ({ userId }) => ({ days: (await syncGarmin(userId, { days: 14 }))?.days ?? 0 }));

export const DELETE = route(async ({ userId }) => {
  await disconnectGarmin(userId);
});
