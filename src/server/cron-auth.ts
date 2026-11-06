import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Cron callers (Vercel Cron, GitHub Actions) send `Authorization: Bearer $CRON_SECRET`. */
export function cronAuthorized(req: Request): boolean {
  // Trim: a secret pasted with a trailing newline would otherwise never match the header.
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
