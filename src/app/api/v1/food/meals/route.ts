import { z } from "zod";
import { body, route, uuid } from "@/server/api";
import { saveMeal } from "@/server/food/foods";

const input = z.object({
  name: z.string().trim().min(1).max(80),
  items: z.array(z.object({ foodId: uuid, grams: z.number().positive().max(5000) })).min(1).max(30),
});

/** Save the basket as a named meal ("Usual breakfast"). Same name replaces. */
export const POST = route(async ({ req, userId }) => {
  const { name, items } = await body(req, input);
  return { id: await saveMeal(userId, name, items) };
});
