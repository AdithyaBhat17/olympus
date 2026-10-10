import { route, uuid } from "@/server/api";
import { retireConstraint } from "@/server/exercises";

export const DELETE = route<{ id: string }>(async ({ userId, params }) => {
  await retireConstraint(userId, uuid.parse(params.id));
});
