import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { oauthClients, oauthCodes, oauthTokens } from "@/lib/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { isAllowedUser } from "@/lib/allowlist";

export { isAllowedUser };

/**
 * Minimal OAuth 2.1 authorization server for the MCP endpoint, per the MCP
 * authorization spec: RFC 8414 metadata, RFC 7591 dynamic client
 * registration, authorization code + PKCE (S256 only), refresh rotation.
 * Identity comes from the app's existing Google sign-in.
 */

export const MCP_SCOPE = "liftlog";
const ACCESS_TTL_SEC = 60 * 60; // 1 h
const REFRESH_TTL_SEC = 60 * 60 * 24 * 30; // 30 d
const CODE_TTL_SEC = 5 * 60;

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function token(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Public origin. Prefer APP_URL so tokens/issuer never depend on Host headers. */
export function publicOrigin(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export function authServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [MCP_SCOPE],
  };
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Olympus LiftLog",
  };
}

// ---------------------------------------------------------------------------
// Dynamic client registration
// ---------------------------------------------------------------------------

/**
 * Registration is open (that's how Claude connects), so the redirect target
 * is what keeps a look-alike client from phishing a token: only Claude's own
 * callback hosts, loopback (Claude Code / Desktop, RFC 8252), and any hosts
 * listed in OAUTH_REDIRECT_HOSTS.
 */
const DEFAULT_REDIRECT_HOSTS = ["claude.ai", "claude.com"];
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

export function redirectHostAllowed(host: string): boolean {
  const extra = (process.env.OAUTH_REDIRECT_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_REDIRECT_HOSTS, ...extra].includes(host.toLowerCase());
}

export function isAcceptableRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash || u.username || u.password) return false;
    if (u.protocol === "https:") return redirectHostAllowed(u.hostname);
    return u.protocol === "http:" && LOOPBACK.includes(u.hostname);
  } catch {
    return false;
  }
}

/** Claude's hosted clients, as opposed to a local app on loopback. */
export function isClaudeRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" && DEFAULT_REDIRECT_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

export async function registerClient(input: { redirectUris: string[]; clientName?: string | null }) {
  const clientId = `mcp_${token(16)}`;
  await db.insert(oauthClients).values({
    clientId,
    clientName: input.clientName?.slice(0, 200) ?? null,
    redirectUris: input.redirectUris,
  });
  return clientId;
}

export async function getClient(clientId: string) {
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId));
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Authorization code
// ---------------------------------------------------------------------------

export async function createAuthCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string | null;
  resource: string | null;
}): Promise<string> {
  const code = token(32);
  await db.insert(oauthCodes).values({
    codeHash: sha256(code),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scope: input.scope,
    resource: input.resource,
    expiresAt: new Date(Date.now() + CODE_TTL_SEC * 1000),
  });
  return code;
}

function pkceMatches(verifier: string, challenge: string): boolean {
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

async function issueTokens(clientId: string, userId: string, scope: string | null) {
  const access = token(32);
  const refresh = token(32);
  const now = Date.now();
  await db.insert(oauthTokens).values([
    {
      tokenHash: sha256(access),
      kind: "access",
      clientId,
      userId,
      scope,
      expiresAt: new Date(now + ACCESS_TTL_SEC * 1000),
    },
    {
      tokenHash: sha256(refresh),
      kind: "refresh",
      clientId,
      userId,
      scope,
      expiresAt: new Date(now + REFRESH_TTL_SEC * 1000),
    },
  ]);
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SEC,
    refresh_token: refresh,
    scope: scope ?? MCP_SCOPE,
  };
}

export async function exchangeCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const [row] = await db
    .select()
    .from(oauthCodes)
    .where(eq(oauthCodes.codeHash, sha256(input.code)));
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    throw new OAuthError("invalid_grant", "Code is invalid, used or expired");
  }
  // Single use: mark before anything else.
  const used = await db
    .update(oauthCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(oauthCodes.codeHash, row.codeHash), isNull(oauthCodes.usedAt)))
    .returning({ h: oauthCodes.codeHash });
  if (used.length === 0) throw new OAuthError("invalid_grant", "Code already used");

  if (row.clientId !== input.clientId) throw new OAuthError("invalid_grant", "Client mismatch");
  if (row.redirectUri !== input.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri mismatch");
  if (!pkceMatches(input.codeVerifier, row.codeChallenge)) {
    throw new OAuthError("invalid_grant", "PKCE verification failed");
  }
  if (!isAllowedUser(row.userId)) throw new OAuthError("access_denied", "User not allowed", 403);
  return issueTokens(row.clientId, row.userId, row.scope);
}

export async function refreshTokens(input: { refreshToken: string; clientId: string }) {
  const hash = sha256(input.refreshToken);
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(and(eq(oauthTokens.tokenHash, hash), eq(oauthTokens.kind, "refresh")));
  if (row?.revokedAt && row.clientId === input.clientId) {
    // A rotated-out refresh token came back: assume it was stolen and kill
    // every live token this client holds for the user (RFC 9700 §4.14.2).
    await db
      .update(oauthTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(oauthTokens.userId, row.userId),
          eq(oauthTokens.clientId, row.clientId),
          isNull(oauthTokens.revokedAt)
        )
      );
    throw new OAuthError("invalid_grant", "Refresh token reuse detected; all tokens revoked");
  }
  if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) {
    throw new OAuthError("invalid_grant", "Refresh token is invalid or expired");
  }
  if (row.clientId !== input.clientId) throw new OAuthError("invalid_grant", "Client mismatch");
  // Rotate: the old refresh token dies now.
  const revoked = await db
    .update(oauthTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthTokens.tokenHash, hash), isNull(oauthTokens.revokedAt)))
    .returning({ h: oauthTokens.tokenHash });
  if (revoked.length === 0) throw new OAuthError("invalid_grant", "Refresh token already used");
  if (!isAllowedUser(row.userId)) throw new OAuthError("access_denied", "User not allowed", 403);
  return issueTokens(row.clientId, row.userId, row.scope);
}

export async function revokeToken(raw: string) {
  await db
    .update(oauthTokens)
    .set({ revokedAt: new Date() })
    .where(eq(oauthTokens.tokenHash, sha256(raw)));
}

/** Revoke every token a user has granted (Settings › Connections › Disconnect). */
export async function revokeAllForUser(userId: string) {
  await db
    .update(oauthTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthTokens.userId, userId), isNull(oauthTokens.revokedAt)));
}

export interface VerifiedToken {
  userId: string;
  clientId: string;
  scopes: string[];
  expiresAt?: number;
}

/**
 * Bearer verification for /api/mcp. Accepts OAuth access tokens, plus an
 * optional static key (MCP_API_KEY → MCP_API_KEY_USER) for Claude Code /
 * Desktop configs that send a header instead of doing OAuth.
 */
export async function verifyBearer(raw: string | undefined): Promise<VerifiedToken | null> {
  if (!raw) return null;

  const staticKey = process.env.MCP_API_KEY;
  const staticUser = process.env.MCP_API_KEY_USER;
  if (staticKey && staticUser && staticKey.length >= 32) {
    const a = Buffer.from(sha256(raw));
    const b = Buffer.from(sha256(staticKey));
    if (timingSafeEqual(a, b)) {
      return { userId: staticUser, clientId: "static-key", scopes: [MCP_SCOPE] };
    }
  }

  const hash = sha256(raw);
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(
      and(
        eq(oauthTokens.tokenHash, hash),
        eq(oauthTokens.kind, "access"),
        isNull(oauthTokens.revokedAt),
        gt(oauthTokens.expiresAt, new Date())
      )
    );
  if (!row || !isAllowedUser(row.userId)) return null;
  // Fire-and-forget usage stamp for Settings › Connections.
  db.update(oauthTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(oauthTokens.tokenHash, hash))
    .catch(() => {});
  return {
    userId: row.userId,
    clientId: row.clientId,
    scopes: (row.scope ?? MCP_SCOPE).split(" "),
    expiresAt: Math.floor(row.expiresAt.getTime() / 1000),
  };
}

export async function connectionStatus(userId: string) {
  const rows = await db
    .select({
      clientId: oauthTokens.clientId,
      kind: oauthTokens.kind,
      expiresAt: oauthTokens.expiresAt,
      revokedAt: oauthTokens.revokedAt,
      lastUsedAt: oauthTokens.lastUsedAt,
      createdAt: oauthTokens.createdAt,
      clientName: oauthClients.clientName,
    })
    .from(oauthTokens)
    .leftJoin(oauthClients, eq(oauthClients.clientId, oauthTokens.clientId))
    .where(eq(oauthTokens.userId, userId));
  const live = rows.filter(
    (r) => !r.revokedAt && r.kind === "refresh" && r.expiresAt.getTime() > Date.now()
  );
  const clients = new Map<string, { name: string; since: Date; lastUsedAt: Date | null }>();
  for (const r of rows) {
    if (!live.some((l) => l.clientId === r.clientId)) continue;
    const prev = clients.get(r.clientId);
    const lastUsed = r.lastUsedAt ?? null;
    clients.set(r.clientId, {
      name: r.clientName ?? r.clientId,
      since: prev && prev.since < r.createdAt ? prev.since : r.createdAt,
      lastUsedAt:
        prev?.lastUsedAt && lastUsed
          ? (prev.lastUsedAt > lastUsed ? prev.lastUsedAt : lastUsed)
          : prev?.lastUsedAt ?? lastUsed,
    });
  }
  return Array.from(clients.entries()).map(([clientId, v]) => ({ clientId, ...v }));
}
