/**
 * Weekly describe-food review (food_parse_events → markdown).
 *
 *   pnpm food:parse-report --user you@gmail.com [--days 7] [--out reviews/food/2026-11-03.md]
 *
 * Read-only. Prints to stdout unless --out is given.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { arg, dbHost } from "../lib/env";

async function main() {
  const user = arg("user");
  if (!user) throw new Error("--user is required");
  const days = Number(arg("days") ?? 7);
  console.error(`DB host: ${dbHost()}`);
  const { db } = await import("../../src/lib/db");
  const { foodParseEvents } = await import("../../src/lib/db/schema");
  const { and, asc, eq, gte } = await import("drizzle-orm");
  const { buildParseReport, reportMarkdown } = await import("../../src/server/food/parse-report");

  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const rows = await db
    .select()
    .from(foodParseEvents)
    .where(and(eq(foodParseEvents.userId, user), gte(foodParseEvents.createdAt, from)))
    .orderBy(asc(foodParseEvents.createdAt));

  const report = buildParseReport(rows.map((r) => ({ ...r, logged: r.foodLogId != null })));
  const md = reportMarkdown(report, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
  const out = arg("out");
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, md);
    console.error(`Wrote ${out}`);
  } else {
    process.stdout.write(md);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
