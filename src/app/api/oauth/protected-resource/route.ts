import { protectedResourceMetadata, publicOrigin } from "@/server/oauth";
import { json, preflight } from "../cors";

// Served at /.well-known/oauth-protected-resource[/api/mcp] (RFC 9728).
export function GET(req: Request) {
  return json(protectedResourceMetadata(publicOrigin(req)));
}
export const OPTIONS = preflight;
