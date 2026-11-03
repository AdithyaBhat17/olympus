/**
 * Import a MyFitnessPal "File Export" ZIP (or its folder of CSVs).
 *
 *   pnpm food:import-mfp --user you@gmail.com --file ~/Downloads/File-Export-….zip [--tz Asia/Dubai]
 *
 * Idempotent: re-running with the same or a longer export adds only new rows.
 */
import { arg, dbHost } from "../lib/env";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";

async function main() {
  const user = arg("user");
  const file = arg("file");
  if (!user || !file) throw new Error("--user and --file are required");
  console.error(`DB host: ${dbHost()}`);

  const files: Record<string, string> = {};
  if (statSync(file).isDirectory()) {
    for (const f of readdirSync(file)) if (f.endsWith(".csv")) files[f] = readFileSync(path.join(file, f), "utf8");
  } else {
    for (const [name, bytes] of Object.entries(unzipSync(new Uint8Array(readFileSync(file))))) {
      if (name.endsWith(".csv")) files[path.basename(name)] = strFromU8(bytes);
    }
  }
  const pick = (prefix: string) => Object.entries(files).find(([n]) => n.startsWith(prefix))?.[1];
  const { importMfp } = await import("../../src/server/food/mfp-import");
  const r = await importMfp(user, { nutritionCsv: pick("Nutrition-Summary"), measurementCsv: pick("Measurement-Summary") }, arg("tz"));
  console.log(JSON.stringify(r));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
