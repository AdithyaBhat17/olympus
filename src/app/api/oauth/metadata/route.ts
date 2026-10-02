import { authServerMetadata, publicOrigin } from "@/server/oauth";
import { json, preflight } from "../cors";

// Served at /.well-known/oauth-authorization-server (see next.config.mjs rewrites).
export function GET(req: Request) {
  return json(authServerMetadata(publicOrigin(req)));
}
export const OPTIONS = preflight;
