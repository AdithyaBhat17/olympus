import "server-only";

/**
 * OpenRouter chat completions with structured (JSON-schema) output. Server
 * only: the key (OPENROUTER_API_KEY or OPENROUTER_KEY) never reaches a
 * client. No Anthropic models.
 *
 * Models are config, not code: FOOD_TEXT_MODEL / FOOD_TEXT_FALLBACK_MODEL,
 * defaulting to Gemini Flash Lite (cheapest that handles Indian dish names
 * well). The fallback is tried on timeouts, 5xx and invalid JSON.
 */

const URL = "https://openrouter.ai/api/v1/chat/completions";

export const TEXT_MODEL = () => process.env.FOOD_TEXT_MODEL || "google/gemini-3.1-flash-lite";
export const TEXT_FALLBACK_MODEL = () => process.env.FOOD_TEXT_FALLBACK_MODEL || "google/gemini-2.5-flash-lite";

/** OPENROUTER_API_KEY, or OPENROUTER_KEY as it's sometimes named. */
function apiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || undefined;
}

export function openRouterConfigured(): boolean {
  return !!apiKey();
}

export type Content = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

export interface JsonCallResult<T> {
  data: T;
  model: string;
  costUsd: number | null;
  latencyMs: number;
  tokens: { prompt: number; completion: number } | null;
  /** URLs the model's web search actually returned (empty without `web`). */
  citations: string[];
}

export class LlmError extends Error {}

function assertNotAnthropic(model: string) {
  if (/anthropic|claude/i.test(model)) throw new LlmError(`Model ${model} is not allowed here`);
}

async function callOnce<T>(
  model: string,
  messages: Array<{ role: "system" | "user"; content: Content }>,
  schema: { name: string; schema: Record<string, unknown> },
  timeoutMs: number,
  fetchImpl: typeof fetch,
  web = false
): Promise<JsonCallResult<T>> {
  assertNotAnthropic(model);
  const started = Date.now();
  const res = await fetchImpl(URL, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      "X-Title": "Olympus",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      response_format: { type: "json_schema", json_schema: { name: schema.name, strict: true, schema: schema.schema } },
      usage: { include: true },
      provider: { require_parameters: true },
      ...(web ? { plugins: [{ id: "web", max_results: 2 }] } : {}),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new LlmError(`OpenRouter ${res.status} (${model}): ${text.slice(0, 200)}`);
  const body = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string; annotations?: Array<{ type?: string; url_citation?: { url?: string } }> } }>;
    usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new LlmError(`OpenRouter (${model}) returned no content`);
  let data: T;
  try {
    data = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
  } catch {
    throw new LlmError(`OpenRouter (${model}) returned invalid JSON`);
  }
  const citations = (body.choices?.[0]?.message?.annotations ?? [])
    .map((a) => a.url_citation?.url)
    .filter((u): u is string => typeof u === "string");
  return {
    data,
    citations,
    model: body.model ?? model,
    costUsd: typeof body.usage?.cost === "number" ? body.usage.cost : null,
    latencyMs: Date.now() - started,
    tokens:
      body.usage?.prompt_tokens != null
        ? { prompt: body.usage.prompt_tokens, completion: body.usage.completion_tokens ?? 0 }
        : null,
  };
}

/** Primary model, then the fallback on any failure. */
export async function jsonCall<T>(opts: {
  messages: Array<{ role: "system" | "user"; content: Content }>;
  schema: { name: string; schema: Record<string, unknown> };
  validate: (data: unknown) => data is T;
  models?: string[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Let the model search the web (OpenRouter's web plugin). */
  web?: boolean;
}): Promise<JsonCallResult<T>> {
  if (!openRouterConfigured()) throw new LlmError("OPENROUTER_API_KEY (or OPENROUTER_KEY) is not set");
  const models = opts.models ?? [TEXT_MODEL(), TEXT_FALLBACK_MODEL()];
  let last: unknown;
  for (const model of models) {
    try {
      const r = await callOnce<unknown>(model, opts.messages, opts.schema, opts.timeoutMs ?? 20_000, opts.fetchImpl ?? fetch, opts.web);
      if (!opts.validate(r.data)) throw new LlmError(`OpenRouter (${model}) JSON didn't match the schema`);
      return r as JsonCallResult<T>;
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new LlmError(String(last));
}
