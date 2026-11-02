/**
 * Run the Garmin sync from a terminal: first connection, backfill, or a
 * check against a Neon branch before a migration goes to production.
 *
 *   pnpm garmin:sync --user you@gmail.com [--days 90] [--connect --expires 2027-11-03]
 *
 * Reads DATABASE_URL, GARMIN_SECRET_KEY and (with --connect) GARMIN_API_KEY
 * from the environment, falling back to .env.local for any that aren't set,
 * so DATABASE_URL=<branch url> pnpm garmin:sync … never touches production.
 */
import { arg, dbHost, flag } from "../lib/env";

const user = arg("user");
if (!user) {
  console.error("--user <email> is required");
  process.exit(1);
}
console.error(`DB host: ${dbHost()}`);

async function main() {
  // Imported after the env is ready: the DB module reads DATABASE_URL on load.
  const { connectGarmin, syncGarmin } = await import("../../src/server/integrations/garmin/sync");
  if (flag("connect")) {
    const key = process.env.GARMIN_API_KEY;
    const expires = arg("expires");
    if (!key || !expires) throw new Error("--connect needs GARMIN_API_KEY and --expires yyyy-mm-dd");
    await connectGarmin(user!, key, new Date(`${expires}T23:59:59Z`));
    console.error("Connected (key stored encrypted).");
  }
  const days = arg("days");
  const t0 = Date.now();
  const r = await syncGarmin(user!, days ? { days: Number(days) } : {});
  console.log(JSON.stringify({ ...r, seconds: Math.round((Date.now() - t0) / 1000) }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
