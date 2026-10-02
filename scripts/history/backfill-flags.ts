/**
 * Recomputes set flags for every DONE session with the same rules a live log
 * uses (annotateSets), oldest first per exercise, and prints UPDATE statements
 * as a JSON array for rows whose set_details change.
 *
 *   npx tsx scripts/history/backfill-flags.ts rows.json > updates.json
 *
 * rows.json is the result of:
 *   SELECT se.id, s.user_id uid, s.date, s.created_at, se.order_index ord,
 *          se.exercise_id ex, e.name, e.load_mode, e.is_compound, e.equipment,
 *          se.set_details, se.sets, se.reps, se.weight, se.rpe
 *   FROM session_exercises se JOIN sessions s ON s.id = se.session_id
 *   JOIN exercises e ON e.id = se.exercise_id WHERE s.status = 'DONE'
 */
import { readFileSync } from "node:fs";
import { annotateSets, topSet, type LoadMode, type SetLogEntry } from "../../src/domain";

interface Row {
  id: string;
  uid: string;
  date: string;
  created_at: string;
  ord: number;
  ex: string;
  name: string;
  load_mode: LoadMode;
  is_compound: boolean;
  equipment: string | null;
  set_details: SetLogEntry[] | null;
  sets: number;
  reps: number;
  weight: string;
  rpe: string | null;
}

const raw = JSON.parse(readFileSync(process.argv[2], "utf8"));
const rows: Row[] = (Array.isArray(raw) ? raw : [raw]).flatMap((r: unknown) => {
  if (Array.isArray(r)) return r;
  const v = Object.values(r as object)[0];
  return Array.isArray(v) ? v : [r];
});
rows.sort((a, b) =>
  a.uid.localeCompare(b.uid) || a.date.localeCompare(b.date) ||
  a.created_at.localeCompare(b.created_at) || a.ord - b.ord
);

const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
const lastTop = new Map<string, number>();
const out: string[] = [];
for (const r of rows) {
  const sets: SetLogEntry[] = r.set_details?.length
    ? r.set_details
    : Array.from({ length: r.sets }, () => ({
        reps: r.reps,
        weight: parseFloat(r.weight),
        rpe: r.rpe != null ? parseFloat(r.rpe) : null,
        type: "working" as const,
      }));
  const ex = { loadMode: r.load_mode, isCompound: r.is_compound, name: r.name, equipment: r.equipment };
  const key = `${r.uid}:${r.ex}`;
  const next = annotateSets(ex, sets, lastTop.get(key) ?? null);
  const top = topSet(r.load_mode, next);
  if (top && r.load_mode !== "TIME") lastTop.set(key, top.weight);
  if (JSON.stringify(next) !== JSON.stringify(r.set_details)) {
    out.push(`UPDATE session_exercises SET set_details = ${q(JSON.stringify(next))}::jsonb WHERE id = ${q(r.id)}`);
  }
}
process.stdout.write(JSON.stringify(out));
