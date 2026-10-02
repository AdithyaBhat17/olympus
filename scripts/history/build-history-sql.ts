/**
 * Turns scripts/history/lift-log.json (a hand transcription of the Obsidian
 * Lift Log) into idempotent SQL, using the app's own domain rules for true
 * load and auto-flags so imported history reads exactly like logged history.
 *
 *   npx tsx scripts/history/build-history-sql.ts > supabase/seed-003-history.sql
 *
 * Re-running the SQL is safe: sessions are skipped when one already exists for
 * that user/date/type, exercises and constraints upsert, check-ins never
 * overwrite a value that's already there.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  flagsForSet,
  topSet,
  trueKg,
  type DomainExercise,
  type LoadMode,
  type SetLogEntry,
} from "../../src/domain";

interface Input {
  userId: string;
  newExercises: Array<{
    name: string;
    category: string;
    status?: "YES" | "SUB" | "NO";
    equipment?: string;
    bodyRegion: "upper" | "lower";
    isCompound?: boolean;
    blockedReason?: string;
    substituteSlugs?: string[];
  }>;
  constraints: Array<{ region: string; rule: string; blockedPatterns: string[] }>;
  sessions: Array<{
    date: string;
    type: string;
    title: string;
    notes?: string;
    checkIn?: { sleepMin?: number; proteinG?: number; waterMl?: number };
    exercises: Array<{
      name: string;
      rpe?: number;
      plates?: boolean;
      blockedOverride?: boolean;
      notes?: string;
      sets: Array<[number, number]>;
    }>;
  }>;
  coachFlags: Array<{
    text: string;
    scope: "global" | "sessionType" | "exerciseId";
    scopeValue?: string;
    exercise?: string;
  }>;
}

/** Load model for the exercises whose maths differ from plain total kg. */
const LOAD: Record<string, Pick<DomainExercise, "loadMode" | "carriageKgPerSide">> = {
  "Iso-Lateral Horizontal Press": { loadMode: "PER_SIDE", carriageKgPerSide: 8.2 },
  "Iso-Lateral Decline Press": { loadMode: "PER_SIDE", carriageKgPerSide: 2.7 },
  "Iso-Lateral Incline Press": { loadMode: "PER_SIDE", carriageKgPerSide: 3.6 },
  "Assisted Pull-Up": { loadMode: "COUNTERWEIGHT", carriageKgPerSide: null },
};
const loadOf = (name: string) =>
  LOAD[name] ?? { loadMode: "TOTAL" as LoadMode, carriageKgPerSide: null };

const q = (v: string | null | undefined) =>
  v == null ? "NULL" : `'${v.replace(/'/g, "''")}'`;
const num = (v: number | null | undefined) => (v == null ? "NULL" : String(v));
const exId = (name: string) =>
  `(SELECT id FROM exercises WHERE name = ${q(name)} AND created_by IS NULL ORDER BY slug NULLS LAST LIMIT 1)`;

const data: Input = JSON.parse(
  readFileSync(join(__dirname, "lift-log.json"), "utf8")
);
const user = q(data.userId);
const out: string[] = [];

// --- Exercises the log uses that the library didn't have ---------------------
for (const e of data.newExercises) {
  out.push(
    `INSERT INTO exercises (name, category, status, equipment, body_region, is_compound, blocked_reason) VALUES (${q(e.name)}, ${q(e.category)}, ${q(e.status ?? "YES")}, ${q(e.equipment ?? null)}, ${q(e.bodyRegion)}, ${e.isCompound ? "TRUE" : "FALSE"}, ${q(e.blockedReason ?? null)}) ON CONFLICT DO NOTHING`
  );
  if (e.substituteSlugs?.length) {
    out.push(
      `UPDATE exercises SET substitute_ids = ARRAY(SELECT id FROM exercises WHERE slug IN (${e.substituteSlugs.map(q).join(", ")})) WHERE name = ${q(e.name)} AND created_by IS NULL`
    );
  }
}

// --- Constraints from the log's standing-constraints section -----------------
for (const c of data.constraints) {
  out.push(
    `INSERT INTO constraints (user_id, region, rule, blocked_patterns) VALUES (NULL, ${q(c.region)}, ${q(c.rule)}, ARRAY[${c.blockedPatterns.map(q).join(", ")}]::TEXT[]) ON CONFLICT (region) WHERE user_id IS NULL DO UPDATE SET rule = EXCLUDED.rule, blocked_patterns = EXCLUDED.blocked_patterns`
  );
}

// --- Sessions, oldest first so auto-flags compare against real history -------
const lastTop = new Map<string, number>();
const sessions = [...data.sessions].sort((a, b) => a.date.localeCompare(b.date));

for (const s of sessions) {
  const rows: string[] = [];
  s.exercises.forEach((ex, order) => {
    const load = loadOf(ex.name);
    const prevTop = lastTop.get(ex.name) ?? null;
    const sets: SetLogEntry[] = ex.sets.map(([kg, reps], i) => {
      const weight = ex.plates ? trueKg(load, kg) : kg;
      const isLast = i === ex.sets.length - 1;
      return {
        reps,
        weight,
        platesKg: ex.plates ? kg : null,
        // The log records one RPE per exercise: it belongs to the final set.
        rpe: isLast ? ex.rpe ?? null : null,
        type: "working",
        flags: flagsForSet(load, { weight, type: "working" }, prevTop, {
          blockedOverride: !!ex.blockedOverride,
        }),
      };
    });
    const top = topSet(load.loadMode, sets);
    if (top) lastTop.set(ex.name, top.weight);

    const aggReps = Math.max(1, ...sets.map((x) => x.reps));
    const aggWeight = Math.max(0, ...sets.map((x) => x.weight)).toFixed(2);
    rows.push(
      `(${q(ex.name)}, ${sets.length}, ${aggReps}, ${aggWeight}, ${q(JSON.stringify(sets))}, ${num(ex.rpe)}, ${q(ex.notes ?? null)}, ${order})`
    );
  });

  const name = `Session ${s.type} · ${s.title}`;
  out.push(
    [
      `WITH s AS (`,
      `  INSERT INTO sessions (user_id, date, session_name, session_type, notes, status, week_number, block_number)`,
      `  SELECT ${user}, ${q(s.date)}, ${q(name)}, ${q(s.type)}, ${q(s.notes ?? null)}, 'DONE', 1, '1'`,
      `  WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE user_id = ${user} AND date = ${q(s.date)} AND session_type = ${q(s.type)})`,
      `  RETURNING id`,
      `)`,
      `INSERT INTO session_exercises (session_id, exercise_id, sets, reps, weight, set_details, rpe, notes, order_index)`,
      `SELECT s.id, ${exId("__NAME__").replace(`'__NAME__'`, "v.name")}, v.sets, v.reps, v.weight::numeric, v.details::jsonb, v.rpe::numeric, v.notes, v.ord`,
      `FROM s CROSS JOIN (VALUES`,
      rows.map((r) => `  ${r}`).join(",\n"),
      `) AS v(name, sets, reps, weight, details, rpe, notes, ord)`,
    ].join("\n")
  );

  const c = s.checkIn;
  if (c) {
    const sources: Record<string, string> = {};
    if (c.sleepMin != null) sources.sleep = "manual";
    if (c.proteinG != null) sources.protein = "manual";
    if (c.waterMl != null) sources.water = "manual";
    out.push(
      `INSERT INTO daily_check_ins (user_id, date, sleep_min, protein_g, water_ml, sources) VALUES (${user}, ${q(s.date)}, ${num(c.sleepMin)}, ${num(c.proteinG)}, ${num(c.waterMl)}, ${q(JSON.stringify(sources))}::jsonb) ON CONFLICT (user_id, date) DO NOTHING`
    );
  }
}

// --- Open coach flags carried forward from the log ---------------------------
for (const f of data.coachFlags) {
  const scopeValue =
    f.scope === "exerciseId" ? `${exId(f.exercise!)}::text` : q(f.scopeValue ?? null);
  out.push(
    `INSERT INTO coach_flags (user_id, text, scope, scope_value, created_by) SELECT ${user}, ${q(f.text)}, ${q(f.scope)}, ${scopeValue}, 'user' WHERE NOT EXISTS (SELECT 1 FROM coach_flags WHERE user_id = ${user} AND text = ${q(f.text)})`
  );
}

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(out));
} else {
  process.stdout.write(
    [
      "-- Generated by scripts/history/build-history-sql.ts from scripts/history/lift-log.json.",
      "-- Imports the Obsidian Lift Log (05/08–21/09/2026). Idempotent: safe to re-run.",
      "",
      ...out.map((s) => `${s};\n`),
    ].join("\n")
  );
}
