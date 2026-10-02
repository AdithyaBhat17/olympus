import { exchangeCode, OAuthError, refreshTokens } from "@/server/oauth";
import { json, preflight } from "../cors";

async function readParams(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await req.json()) as Record<string, string>;
    return new URLSearchParams(body);
  }
  return new URLSearchParams(await req.text());
}

export async function POST(req: Request) {
  try {
    const p = await readParams(req);
    const grant = p.get("grant_type");
    const clientId = p.get("client_id") ?? "";
    if (!clientId) throw new OAuthError("invalid_client", "client_id is required", 401);

    if (grant === "authorization_code") {
      const code = p.get("code");
      const redirectUri = p.get("redirect_uri");
      const verifier = p.get("code_verifier");
      if (!code || !redirectUri || !verifier) {
        throw new OAuthError("invalid_request", "code, redirect_uri and code_verifier are required");
      }
      return json(await exchangeCode({ code, clientId, redirectUri, codeVerifier: verifier }));
    }
    if (grant === "refresh_token") {
      const refreshToken = p.get("refresh_token");
      if (!refreshToken) throw new OAuthError("invalid_request", "refresh_token is required");
      return json(await refreshTokens({ refreshToken, clientId }));
    }
    throw new OAuthError("unsupported_grant_type", `Unsupported grant_type ${grant}`);
  } catch (err) {
    if (err instanceof OAuthError) {
      return json({ error: err.code, error_description: err.message }, err.status);
    }
    console.error("oauth token error", err);
    return json({ error: "server_error" }, 500);
  }
}
export const OPTIONS = preflight;
