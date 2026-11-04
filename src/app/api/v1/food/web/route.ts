import { z } from "zod";
import { body, route } from "@/server/api";
import { DomainError } from "@/server/errors";
import { openRouterConfigured } from "@/server/llm/openrouter";
import { webLookupFood } from "@/server/food/web-lookup";

const input = z.object({ query: z.string().trim().min(3).max(120) });

/**
 * "Search the web" from the food search: look a product up, cache it as the
 * athlete's own food, return it. 404-style miss is `food: null` with a reason.
 */
export const POST = route(async ({ req, userId }) => {
  if (!openRouterConfigured()) throw new DomainError("Web lookup isn't set up on the server (OpenRouter key missing).");
  const { query } = await body(req, input);
  const r = await webLookupFood(userId, query);
  return { food: r.food, cached: r.cached, reason: r.reason ?? null };
});
