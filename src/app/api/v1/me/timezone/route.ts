import { z } from "zod";
import { body, route } from "@/server/api";
import { adoptTimezone } from "@/server/profile";

/** The phone's timezone, adopted once for an athlete who hasn't set one. */
export const POST = route(async ({ req, userId }) => {
  const { timezone } = await body(req, z.object({ timezone: z.string().min(1).max(64) }));
  return { adopted: await adoptTimezone(userId, timezone) };
});
