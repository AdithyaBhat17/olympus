import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

let who: { userId: string; clientId: string; scopes: string[] } | null = null;
vi.mock("./oauth", async (importOriginal) => {
  const real = await importOriginal<typeof import("./oauth")>();
  return { ...real, verifyBearer: vi.fn(async () => who) };
});

const { route, body, NotFound } = await import("./api");
const { DomainError } = await import("./errors");
const { isAcceptableRedirectUri, scopeForClient, APP_SCOPE, MCP_SCOPE } = await import("./oauth");

const req = (init: RequestInit = {}) =>
  new Request("http://localhost/api/v1/x", { headers: { authorization: "Bearer t" }, ...init });
const ctx = { params: Promise.resolve({}) };

describe("/api/v1 access", () => {
  beforeEach(() => {
    who = null;
  });

  it("401s without a valid token", async () => {
    const res = await route(async () => ({ ok: 1 }))(req(), ctx);
    expect(res.status).toBe(401);
  });

  it("403s a Claude connector token, even a valid one", async () => {
    who = { userId: "a@b.c", clientId: "mcp_abc", scopes: [MCP_SCOPE] };
    const res = await route(async () => ({ ok: 1 }))(req(), ctx);
    expect(res.status).toBe(403);
  });

  it("lets the iOS app's own token through as that user", async () => {
    who = { userId: "a@b.c", clientId: "olympus-ios", scopes: [APP_SCOPE] };
    const res = await route(async ({ userId }) => ({ userId }))(req(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "a@b.c" });
  });

  it("maps errors: domain → 400, missing rows → 404, bad input → 400, bugs → 500", async () => {
    who = { userId: "a@b.c", clientId: "olympus-ios", scopes: [APP_SCOPE] };
    const run = async (fn: () => Promise<unknown>) => (await route(fn)(req(), ctx)).status;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await run(async () => { throw new DomainError("Session is already finished"); })).toBe(400);
    expect(await run(async () => { throw new DomainError("Session not found"); })).toBe(404);
    expect(await run(async () => { throw new NotFound("Exercise not found"); })).toBe(404);
    expect(await run(async () => z.string().uuid().parse("nope"))).toBe(400);
    expect(await run(async () => { throw new Error("boom"); })).toBe(500);
  });

  it("parses JSON bodies against a schema", async () => {
    who = { userId: "a@b.c", clientId: "olympus-ios", scopes: [APP_SCOPE] };
    const handler = route(async ({ req }) => body(req, z.object({ n: z.number() })));
    expect((await handler(req({ method: "POST", body: '{"n":1}' }), ctx)).status).toBe(200);
    expect((await handler(req({ method: "POST", body: "{nope" }), ctx)).status).toBe(400);
  });
});

describe("OAuth clients", () => {
  it("pins the scope to the client, whatever it asks for", () => {
    expect(scopeForClient("olympus-ios")).toBe(APP_SCOPE);
    expect(scopeForClient("mcp_whatever")).toBe(MCP_SCOPE);
  });

  it("accepts the app's exact callback and nothing else on its scheme", () => {
    expect(isAcceptableRedirectUri("olympus://oauth/callback")).toBe(true);
    expect(isAcceptableRedirectUri("olympus://evil")).toBe(false);
    expect(isAcceptableRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAcceptableRedirectUri("https://evil.example/cb")).toBe(false);
  });
});
