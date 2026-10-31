import { z } from "zod";
import { body, route } from "@/server/api";
import { heartRateBody, saveSessionHeartRates, sessionWindows } from "@/server/session-heart-rate";

const days = z.coerce.number().int().min(1).max(31).default(3);

/** Recent finished sessions' windows, for the app to read heart rate from Health. */
export const GET = route(async ({ req, userId }) => ({
  sessions: await sessionWindows(userId, days.parse(new URL(req.url).searchParams.get("days") ?? undefined)),
}));

/** One heart-rate summary per session, from Health. */
export const POST = route(async ({ req, userId }) => ({
  saved: await saveSessionHeartRates(userId, await body(req, heartRateBody)),
}));
