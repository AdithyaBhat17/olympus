import { z } from "zod";
import { body, route } from "@/server/api";
import { saveConstraint } from "@/server/exercises";

const input = z.object({
  region: z.string(),
  rule: z.string(),
  blockedPatterns: z.array(z.string()).max(30),
});

/** Add an injury, or rewrite the one with the same region. */
export const POST = route(async ({ req, userId }) => {
  await saveConstraint(userId, await body(req, input));
});
