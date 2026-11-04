import "server-only";
import { jsonCall } from "../llm/openrouter";
import type { Extract } from "./firecrawl";
import { isWebFoodAnswer, pageExtractPrompt, WEB_FOOD_SCHEMA, type WebFoodAnswer } from "./web-food";

/** A small model (no web search, so no search fee) reads the label text of a page Firecrawl fetched: about a tenth of a cent. */
export const extractFromPage: Extract = async ({ query, url, text }) => {
  const r = await jsonCall<WebFoodAnswer>({
    messages: pageExtractPrompt(query, url, text),
    schema: WEB_FOOD_SCHEMA as unknown as { name: string; schema: Record<string, unknown> },
    validate: isWebFoodAnswer,
    timeoutMs: 20_000,
  });
  return { answer: r.data, costUsd: r.costUsd ?? 0 };
};
