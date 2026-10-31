import { body, route } from "@/server/api";
import { activitiesBody, replaceActivities } from "@/server/external-activities";

/** Every Health workout from fromMs on; replaces what that range held. */
export const POST = route(async ({ req, userId }) => ({
  saved: await replaceActivities(userId, await body(req, activitiesBody)),
}));
