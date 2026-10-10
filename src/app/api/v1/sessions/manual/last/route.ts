import { z } from "zod";
import { route } from "@/server/api";
import { lastSessionByName } from "@/server/manual-log";

/** "Fill from last <name>": the most recent session with that name. */
export const GET = route(async ({ req, userId }) => {
  const name = z.string().min(1).max(100).parse(new URL(req.url).searchParams.get("name"));
  return { session: await lastSessionByName(userId, name) };
});
