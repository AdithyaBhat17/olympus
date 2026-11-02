/**
 * Shared setup for CLI scripts that call server code written for Next.
 * Import this first (and the server modules dynamically, after it):
 *
 * - env: values already in the environment win; .env.local fills the rest,
 *   so DATABASE_URL=<branch url> pnpm … never touches production.
 * - `server-only` throws outside a server bundle and React 18 has no
 *   cache(); both are mapped the way Next maps them, for the CLI only.
 */
import { existsSync, readFileSync } from "node:fs";
import Module from "node:module";
import { parseEnv } from "node:util";

if (existsSync(".env.local")) {
  for (const [k, v] of Object.entries(parseEnv(readFileSync(".env.local", "utf8")))) {
    if (process.env[k] === undefined && v !== undefined) process.env[k] = v;
  }
}

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

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
export const flag = (name: string) => process.argv.includes(`--${name}`);

export function dbHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host;
  } catch {
    return "(unset)";
  }
}
