import { route } from "@/server/api";
import { historyScreen } from "@/server/screens/history";

export const GET = route(async ({ userId }) => historyScreen(userId));
