import { body, route } from "@/server/api";
import { libraryScreen } from "@/server/screens/library";
import { createCustomExerciseFor, createExerciseSchema } from "@/server/manual-log";

export const GET = route(async ({ userId }) => libraryScreen(userId));

/** Add a custom exercise (visible only to this athlete). */
export const POST = route(async ({ req, userId }) => ({
  exercise: await createCustomExerciseFor(userId, await body(req, createExerciseSchema)),
}));
