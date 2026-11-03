import { route } from "@/server/api";
import { favouriteFoods, listSavedMeals, recentFoods } from "@/server/food/foods";

/** What the search tab shows before you type: saved meals, favourites, recents. */
export const GET = route(async ({ userId }) => {
  const [recent, favourites, meals] = await Promise.all([recentFoods(userId, 15), favouriteFoods(userId), listSavedMeals(userId)]);
  return { recent, favourites, meals };
});
