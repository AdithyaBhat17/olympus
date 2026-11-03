import { route } from "@/server/api";
import { foodScreen } from "@/server/food/screen";

/** The Food screen for ?date=YYYY-MM-DD (today by default): day, week strip, supplement slots. */
export const GET = route(async ({ req, userId }) => {
  const date = new URL(req.url).searchParams.get("date") ?? undefined;
  return foodScreen(userId, date);
});
