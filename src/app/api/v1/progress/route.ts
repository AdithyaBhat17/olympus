import { route } from "@/server/api";
import { progressScreen } from "@/server/screens/progress";

export const GET = route(async ({ userId }) => progressScreen(userId));
