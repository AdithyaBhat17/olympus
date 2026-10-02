import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/server/mcp/server";
import { publicOrigin, verifyBearer } from "@/server/oauth";
import { CORS_HEADERS, preflight } from "../oauth/cors";

/**
 * LiftLog MCP — Streamable HTTP, stateless (a fresh server per request, JSON
 * responses, no SSE sessions), so it runs fine on serverless.
 * Add it in Claude as a custom connector: https://<app>/api/mcp
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized(req: Request) {
  const origin = publicOrigin(req);
  return new Response(JSON.stringify({ error: "invalid_token", error_description: "Missing or invalid bearer token" }), {
    status: 401,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`,
      "Access-Control-Expose-Headers": "WWW-Authenticate",
    },
  });
}

async function handle(req: Request): Promise<Response> {
  const header = req.headers.get("authorization") ?? "";
  const raw = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
  const who = await verifyBearer(raw);
  if (!who) return unauthorized(req);

  const server = buildMcpServer({ userId: who.userId, clientId: who.clientId });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(req, {
      authInfo: {
        token: raw!,
        clientId: who.clientId,
        scopes: who.scopes,
        expiresAt: who.expiresAt,
        extra: { userId: who.userId },
      },
    });
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  } finally {
    // Stateless: nothing to keep between requests.
    transport.close().catch(() => {});
    server.close().catch(() => {});
  }
}

export const POST = handle;
export const DELETE = handle;

/** No standalone SSE stream in stateless mode. */
export function GET() {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { ...CORS_HEADERS, Allow: "POST, OPTIONS" },
  });
}

export const OPTIONS = preflight;
