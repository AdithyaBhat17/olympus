import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const url = process.env.DATABASE_URL;

/**
 * Neon's HTTP driver in production; plain node-postgres for any non-Neon URL
 * (local Postgres for development and end-to-end tests).
 */
function create() {
  if (/\.neon\.tech|neon\.build/.test(url) || process.env.DB_DRIVER === "neon") {
    return drizzleNeon(neon(url), { schema });
  }
  return drizzlePg(new Pool({ connectionString: url, max: 5 }), { schema }) as unknown as ReturnType<
    typeof drizzleNeon<typeof schema>
  >;
}

const globalForDb = globalThis as unknown as { __olympusDb?: ReturnType<typeof create> };
export const db = globalForDb.__olympusDb ?? (globalForDb.__olympusDb = create());
