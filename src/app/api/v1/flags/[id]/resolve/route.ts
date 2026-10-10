import { route, uuid } from "@/server/api";
import { resolveFlag } from "@/server/flags";

export const POST = route<{ id: string }>(async ({ userId, params }) => {
  await resolveFlag(userId, uuid.parse(params.id));
});
