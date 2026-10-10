import { NotFound, route, uuid } from "@/server/api";
import { exerciseProgressScreen } from "@/server/screens/exercise-progress";

export const GET = route<{ exerciseId: string }>(async ({ userId, params }) => {
  const screen = await exerciseProgressScreen(userId, uuid.parse(params.exerciseId));
  if (!screen) throw new NotFound("Exercise not found");
  return screen;
});
