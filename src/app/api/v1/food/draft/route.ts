import { z } from "zod";
import { body, route } from "@/server/api";
import { DomainError } from "@/server/errors";
import { LlmError, openRouterConfigured } from "@/server/llm/openrouter";
import { draftFromText } from "@/server/food/log-text";

const input = z.object({ text: z.string().trim().min(2).max(1000) });

/** "2 rotis and dal" -> matched foods with proposed grams. Nothing is logged. */
export const POST = route(async ({ req, userId }) => {
  if (!openRouterConfigured()) throw new DomainError("Text logging isn't set up on the server (OpenRouter key missing).");
  const { text } = await body(req, input);
  try {
    return await draftFromText(userId, text, "ios");
  } catch (err) {
    if (err instanceof LlmError) {
      console.error(err);
      throw new DomainError("Couldn't read that. Try again, or search for the food.");
    }
    throw err;
  }
});
