import { body, route } from "@/server/api";
import { healthIngestBody, ingestHealthDays } from "@/server/integrations/apple-health";

/** Daily Apple Health values from the app (same body as /api/ingest/health). */
export const POST = route(async ({ req, userId }) => ({
  saved: await ingestHealthDays(userId, await body(req, healthIngestBody)),
}));
