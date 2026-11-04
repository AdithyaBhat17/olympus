import { route } from "@/server/api";
import { favouriteFoods, frequentFoods, listSavedMeals, recentFoods } from "@/server/food/foods";

/** What the search tab shows before you type: saved meals, favourites, frequent, recents. */
export const GET = route(async ({ userId }) => {
  const [recent, frequent, favourites, meals] = await Promise.all([recentFoods(userId, 15), frequentFoods(userId, 15), favouriteFoods(userId), listSavedMeals(userId)]);
  return { recent, frequent, favourites, meals };
});
