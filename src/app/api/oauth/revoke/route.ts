import { revokeToken } from "@/server/oauth";
import { json, preflight } from "../cors";

/** RFC 7009: always 200, even for unknown tokens. */
export async function POST(req: Request) {
  const p = new URLSearchParams(await req.text());
  const t = p.get("token");
  if (t) await revokeToken(t);
  return json({});
}
export const OPTIONS = preflight;
