import { z } from "zod";
import { body, route, uuid } from "@/server/api";
import { DomainError, startSession } from "@/server/sessions";
import { planFromLastSession } from "@/server/plans";

const input = z.union([
  z.object({ planId: uuid }),
  z.object({ type: z.string().min(1).max(20) }),
]);

/**
 * Start (or resume) a session: from a plan, or for a rotation letter with no
 * plan (built from the last session of that type). Idempotent, like the web.
 */
export const POST = route(async ({ req, userId }) => {
  const v = await body(req, input);
  let planId: string;
  if ("planId" in v) {
    planId = v.planId;
  } else {
    const res = await planFromLastSession(userId, v.type);
    if (!res.planId) throw new DomainError(res.errors[0]?.message ?? "Couldn't build a plan");
    planId = res.planId;
  }
  return { id: await startSession(userId, planId) };
});
