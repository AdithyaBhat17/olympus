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
import { existsSync, readFileSync } from "node:fs";
import Module from "node:module";
import { parseEnv } from "node:util";

// The sync is server code written for Next: `server-only` throws outside a
// server bundle, and React's cache() exists only in the React Next ships.
// Map both the way Next does, for this CLI only.
type Resolver = (request: string, ...rest: unknown[]) => string;
const mod = Module as unknown as { _resolveFilename: Resolver };
const resolve = mod._resolveFilename;
const aliases: Record<string, string> = {
  "server-only": require.resolve("server-only").replace(/index\.js$/, "empty.js"),
  react: require.resolve("next/dist/compiled/react"),
};
mod._resolveFilename = function (request: string, ...rest: unknown[]) {
  return aliases[request] ?? resolve.call(this, request, ...rest);
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

if (existsSync(".env.local")) {
  for (const [k, v] of Object.entries(parseEnv(readFileSync(".env.local", "utf8")))) {
    if (process.env[k] === undefined && v !== undefined) process.env[k] = v;
  }
}

const user = arg("user");
if (!user) {
  console.error("--user <email> is required");
  process.exit(1);
}
const host = new URL(process.env.DATABASE_URL ?? "postgres://unset").host;
console.error(`DB host: ${host}`);

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
