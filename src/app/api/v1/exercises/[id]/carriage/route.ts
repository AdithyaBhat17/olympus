import { z } from "zod";
import { body, route, uuid } from "@/server/api";
import { setCarriage } from "@/server/exercises";

/** The empty weight of an iso-lateral machine's carriage, per side. */
export const PUT = route<{ id: string }>(async ({ req, userId, params }) => {
  const { kgPerSide } = await body(req, z.object({ kgPerSide: z.number().min(0).max(100).nullable() }));
  await setCarriage(userId, uuid.parse(params.id), kgPerSide);
});
