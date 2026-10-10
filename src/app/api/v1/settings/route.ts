import { route } from "@/server/api";
import { publicOrigin } from "@/server/oauth";
import { settingsScreen } from "@/server/screens/settings";

export const GET = route(async ({ req, userId }) => settingsScreen(userId, publicOrigin(req)));
