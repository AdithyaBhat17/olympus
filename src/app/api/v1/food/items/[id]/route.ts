import { z } from "zod";
import { body, route, uuid } from "@/server/api";
import { deleteItem, updateItemGrams } from "@/server/food/logs";

const input = z.object({ grams: z.number().positive().max(5000) });

export const PATCH = route<{ id: string }>(async ({ req, userId, params }) => {
  const { grams } = await body(req, input);
  await updateItemGrams(userId, uuid.parse(params.id), grams);
  return { ok: true };
});

export const DELETE = route<{ id: string }>(async ({ userId, params }) => {
  await deleteItem(userId, uuid.parse(params.id));
  return { ok: true };
});
