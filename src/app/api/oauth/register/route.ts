import { z } from "zod";
import { isAcceptableRedirectUri, registerClient } from "@/server/oauth";
import { json, preflight } from "../cors";

const schema = z.object({
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  client_name: z.string().max(200).optional(),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().optional(),
});

/** RFC 7591 dynamic client registration — public clients only (PKCE, no secret). */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_client_metadata", error_description: "Body must be JSON" }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "invalid_client_metadata", error_description: "redirect_uris is required" }, 400);
  }
  const bad = parsed.data.redirect_uris.filter((u) => !isAcceptableRedirectUri(u));
  if (bad.length) {
    return json(
      { error: "invalid_redirect_uri", error_description: `Not allowed: ${bad.join(", ")}` },
      400
    );
  }
  const clientId = await registerClient({
    redirectUris: parsed.data.redirect_uris,
    clientName: parsed.data.client_name,
  });
  return json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: parsed.data.client_name,
      redirect_uris: parsed.data.redirect_uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201
  );
}
export const OPTIONS = preflight;
