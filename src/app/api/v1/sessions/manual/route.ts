import { body, route } from "@/server/api";
import { manualLogOptions, saveManualSession, saveSessionSchema } from "@/server/manual-log";

/** What the "log a past session" form picks from. */
export const GET = route(async ({ userId }) => manualLogOptions(userId));

export const POST = route(async ({ req, userId }) => saveManualSession(userId, await body(req, saveSessionSchema)));
