import { route } from "@/server/api";
import { searchFoods } from "@/server/food/foods";

export const GET = route(async ({ req, userId }) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 100);
  return { foods: q.trim().length < 2 ? [] : await searchFoods(userId, q) };
});
