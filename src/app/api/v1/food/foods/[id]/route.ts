import { route, uuid } from "@/server/api";
import { getFood } from "@/server/food/foods";

/** A food's portions ("1 roti = 40 g"), for the confirm sheet. */
export const GET = route<{ id: string }>(async ({ userId, params }) => {
  const { food, portions } = await getFood(userId, uuid.parse(params.id));
  return { id: food.id, portions };
});
