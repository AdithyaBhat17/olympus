/**
 * Garmin Connect Personal API client. Pull-only, the athlete's own data.
 *
 * Auth (developer.garmin.com/gc-developer-program/personal/personal-faq):
 * the personal API key is exchanged for an access token by POSTing to the
 * token endpoint with `Authorization: ApiKey <key>`. Tokens last 24 h (or
 * until the key expires); there are no refresh tokens, so we just ask again.
 * Data calls use `Authorization: Bearer <token>`.
 *
 * No rate limit is documented, so calls are spaced out and retried with
 * exponential backoff on 429 / 5xx / network errors, honouring Retry-After.
 *
 * No `server-only` import: the discovery script runs this under plain Node.
 * Never import it from client components; the key must stay on the server.
 */

export const GARMIN_API = "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";

export class GarminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
    readonly body: string
  ) {
    super(message);
  }
}

export interface GarminToken {
  accessToken: string;
  expiresAt: number;
  /** Field names of the token response, for the discovery report. Never values. */
  responseKeys: string[];
}

export interface GarminResponse<T = unknown> {
  status: number;
  path: string;
  latencyMs: number;
  data: T;
}

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Minimum gap between requests. */
  minIntervalMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Delay before retry `attempt` (0-based): Retry-After if given, else 1 s, 2 s, 4 s … capped at 60 s, with jitter. */
export function backoffMs(attempt: number, retryAfter: string | null, rand = Math.random()): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 120_000);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.max(0, Math.min(at - Date.now(), 120_000));
  }
  const base = Math.min(1000 * 2 ** attempt, 60_000);
  return Math.round(base * (0.75 + rand * 0.5));
}

function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export function parseTokenResponse(body: Record<string, unknown>, now: number): GarminToken {
  const accessToken = (body.access_token ?? body.accessToken ?? body.token) as string | undefined;
  if (!accessToken || typeof accessToken !== "string") {
    throw new Error(`Garmin token response had no access token (keys: ${Object.keys(body).join(", ")})`);
  }
  const expiresIn = Number(body.expires_in ?? body.expiresIn ?? 24 * 3600);
  return {
    accessToken,
    // Renew 10 minutes early.
    expiresAt: now + Math.max(60, expiresIn - 600) * 1000,
    responseKeys: Object.keys(body).sort(),
  };
}

export class GarminClient {
  private token: GarminToken | null = null;
  private lastRequestAt = 0;
  private readonly baseUrl: string;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly opts: ClientOptions) {
    this.baseUrl = opts.baseUrl ?? GARMIN_API;
    this.minIntervalMs = opts.minIntervalMs ?? 500;
    this.maxRetries = opts.maxRetries ?? 5;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? Date.now;
  }

  async getToken(force = false): Promise<GarminToken> {
    if (!force && this.token && this.token.expiresAt > this.now()) return this.token;
    const res = await this.request(TOKEN_PATH, {
      method: "POST",
      headers: { Authorization: `ApiKey ${this.opts.apiKey}`, Accept: "application/json" },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new GarminApiError(`Garmin token exchange failed: ${res.status}`, res.status, TOKEN_PATH, text.slice(0, 300));
    }
    this.token = parseTokenResponse(JSON.parse(text), this.now());
    return this.token;
  }

  async getJson<T = unknown>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<GarminResponse<T>> {
    const res = await this.authed(path, query, "application/json");
    const text = await res.response.text();
    const data = (text ? JSON.parse(text) : null) as T;
    return { status: res.response.status, path: res.url, latencyMs: res.latencyMs, data };
  }

  async getBytes(path: string): Promise<GarminResponse<Uint8Array>> {
    const res = await this.authed(path, undefined, "*/*");
    const data = new Uint8Array(await res.response.arrayBuffer());
    return { status: res.response.status, path: res.url, latencyMs: res.latencyMs, data };
  }

  private async authed(
    path: string,
    query: Record<string, string | number | boolean | undefined> | undefined,
    accept: string
  ): Promise<{ response: Response; url: string; latencyMs: number }> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) qs.set(k, String(v));
    const url = qs.size ? `${path}?${qs}` : path;

    let retriedAuth = false;
    for (;;) {
      const token = await this.getToken();
      const started = this.now();
      const response = await this.request(url, {
        headers: { Authorization: `Bearer ${token.accessToken}`, Accept: accept },
      });
      const latencyMs = this.now() - started;
      if (response.status === 401 && !retriedAuth) {
        retriedAuth = true;
        await response.body?.cancel();
        await this.getToken(true);
        continue;
      }
      if (!response.ok) {
        const body = await response.text();
        throw new GarminApiError(`Garmin ${response.status} for ${url}`, response.status, url, body.slice(0, 500));
      }
      return { response, url, latencyMs };
    }
  }

  /** Spaced, retried fetch. Returns the last response for non-retryable statuses. */
  private async request(path: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.lastRequestAt + this.minIntervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastRequestAt = this.now();
      let res: Response;
      try {
        res = await this.fetchImpl(this.baseUrl + path, { ...init, cache: "no-store" });
      } catch (err) {
        if (attempt >= this.maxRetries) throw err;
        await this.sleep(backoffMs(attempt, null));
        continue;
      }
      if (!retryable(res.status) || attempt >= this.maxRetries) return res;
      const retryAfter = res.headers.get("retry-after");
      await res.body?.cancel();
      await this.sleep(backoffMs(attempt, retryAfter));
    }
  }
}
