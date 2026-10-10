import { route, uuid } from "@/server/api";
import { finishScreen } from "@/server/screens/session";

export const GET = route<{ id: string }>(async ({ userId, params }) => finishScreen(userId, uuid.parse(params.id)));
