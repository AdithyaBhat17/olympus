import "server-only";
import { z } from "zod";
import { DomainError } from "./errors";
import { APP_SCOPE, isAppClient, verifyBearer } from "./oauth";

/**
 * /api/v1: the JSON API behind the iOS app. Same rules as the server actions
 * (every rule lives in src/domain and src/server); only the transport differs.
 * Accepts the app's own OAuth tokens and nothing else: a Claude token, even a
 * valid one, gets a 403 here, because this API can delete things.
 */

export interface ApiContext<P> {
  req: Request;
  userId: string;
  params: P;
}

type Handler<P> = (ctx: ApiContext<P>) => Promise<unknown>;

export class NotFound extends Error {}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function route<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: Request, ctx: { params: Promise<P> }): Promise<Response> => {
    const header = req.headers.get("authorization") ?? "";
    const raw = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
    const who = await verifyBearer(raw);
    if (!who) {
      return json({ error: "Sign in again." }, 401, { "WWW-Authenticate": 'Bearer error="invalid_token"' });
    }
    if (!isAppClient(who.clientId) || !who.scopes.includes(APP_SCOPE)) {
      return json({ error: "This token can't use the app API." }, 403);
    }
    try {
      const data = await handler({ req, userId: who.userId, params: await ctx.params });
      return data instanceof Response ? data : json(data ?? { ok: true });
    } catch (err) {
      if (err instanceof NotFound) return json({ error: err.message || "Not found" }, 404);
      if (err instanceof DomainError) {
        // "Session not found" and friends: the server functions use DomainError for missing rows too.
        return json({ error: err.message }, /not found/i.test(err.message) ? 404 : 400);
      }
      if (err instanceof z.ZodError) return json({ error: "Invalid input", issues: err.issues }, 400);
      if (err instanceof SyntaxError) return json({ error: "Body must be JSON" }, 400);
      console.error(err);
      return json({ error: "Something went wrong" }, 500);
    }
  };
}

/** Parse the JSON body against `schema`. Throws ZodError / SyntaxError, which `route` maps to 400. */
export async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const text = await req.text();
  return schema.parse(text ? JSON.parse(text) : {});
}

export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
