import { z } from "zod";
import { body, route } from "@/server/api";
import { webLookupFood } from "@/server/food/web-lookup";

const input = z.object({ query: z.string().trim().min(3).max(120) });

/**
 * "Search the web" from the food search: look a product up, cache it as the
 * athlete's own food, return it. 404-style miss is `food: null` with a reason.
 */
export const POST = route(async ({ req, userId }) => {
  const { query } = await body(req, input);
  const r = await webLookupFood(userId, query);
  return { food: r.food, cached: r.cached, reason: r.reason ?? null };
});
