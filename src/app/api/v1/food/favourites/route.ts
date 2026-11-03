import { z } from "zod";
import { body, route, uuid } from "@/server/api";
import { setFavourite } from "@/server/food/foods";

const input = z.object({ foodId: uuid, on: z.boolean() });

export const POST = route(async ({ req, userId }) => {
  const { foodId, on } = await body(req, input);
  await setFavourite(userId, foodId, on);
  return { ok: true };
});
