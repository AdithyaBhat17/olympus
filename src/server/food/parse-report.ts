/**
 * The weekly describe-food review: what to fix next, from food_parse_events.
 * Pure, so it can be tested; scripts/food/parse-report.ts loads the rows.
 *
 * Each section maps to one kind of fix:
 * - Not in the database  → add the food (or an alias, or a source).
 * - Wrong match          → search ranking or aliases ("masala chai" → "Dry masala chops").
 * - Grams corrected      → portion defaults in the prompt.
 * - Abandoned / errors   → the flow itself.
 */
import type { ParseDraftItem, ParseFinalItem } from "@/lib/db/schema";

export interface ParseEventRow {
  createdAt: Date;
  text: string;
  client: string | null;
  model: string | null;
  latencyMs: number | null;
  costUsd: number | null;
  error: string | null;
  draft: ParseDraftItem[];
  final: ParseFinalItem[] | null;
  logged: boolean;
  unmatched: number;
  kept: number | null;
  regrammed: number | null;
  swapped: number | null;
  removed: number | null;
  added: number | null;
}

export interface ParseReport {
  attempts: number;
  logged: number;
  abandoned: number;
  errors: number;
  latencyP50: number | null;
  latencyP95: number | null;
  costUsd: number;
  items: { drafted: number; unmatched: number; kept: number; regrammed: number; swapped: number; removed: number; added: number };
  /** Keep rate over drafted items in logged attempts: kept / (kept + regrammed + swapped + removed + unmatched). */
  exactRate: number | null;
  missing: Array<{ said: string; search: string; times: number; examples: string[] }>;
  wrongMatches: Array<{ said: string; drafted: string; times: number }>;
  grams: Array<{ said: string; food: string; drafted: number; saved: number }>;
  abandoned_: string[];
  errors_: string[];
  byModel: Array<{ model: string; attempts: number; p50: number | null }>;
}

function pct(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

export function buildParseReport(rows: ParseEventRow[]): ParseReport {
  const latencies = rows.map((r) => r.latencyMs).filter((n): n is number => n != null).sort((a, b) => a - b);
  const sum = (k: "kept" | "regrammed" | "swapped" | "removed" | "added") => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
  const items = {
    drafted: rows.reduce((s, r) => s + r.draft.filter((d) => !d.supplementId).length, 0),
    unmatched: rows.reduce((s, r) => s + r.unmatched, 0),
    kept: sum("kept"),
    regrammed: sum("regrammed"),
    swapped: sum("swapped"),
    removed: sum("removed"),
    added: sum("added"),
  };
  const loggedRows = rows.filter((r) => r.logged);
  const loggedUnmatched = loggedRows.reduce((s, r) => s + r.unmatched, 0);
  const denom = items.kept + items.regrammed + items.swapped + items.removed + loggedUnmatched;

  // Not in the database: every unmatched draft item, logged or not.
  const missing = new Map<string, { said: string; search: string; times: number; examples: string[] }>();
  for (const r of rows) {
    // Supplements are logged as doses, not looked up as foods.
    for (const d of r.draft.filter((x) => !x.matchId && !x.supplementId)) {
      const k = d.search || d.said;
      const m = missing.get(k) ?? { said: d.said, search: d.search, times: 0, examples: [] };
      m.times++;
      if (m.examples.length < 3 && !m.examples.includes(r.text)) m.examples.push(r.text);
      missing.set(k, m);
    }
  }

  // Wrong match / corrected grams: drafted foods compared with what was saved.
  const wrong = new Map<string, { said: string; drafted: string; times: number }>();
  const grams: ParseReport["grams"] = [];
  for (const r of loggedRows) {
    const pool = [...(r.final ?? [])];
    for (const d of r.draft) {
      if (!d.matchId) continue;
      const i = pool.findIndex((f) => f.foodId === d.matchId);
      if (i < 0) {
        const k = `${d.said}→${d.matchName}`;
        const w = wrong.get(k) ?? { said: d.said, drafted: d.matchName ?? "?", times: 0 };
        w.times++;
        wrong.set(k, w);
        continue;
      }
      const [f] = pool.splice(i, 1);
      if (Math.abs(f.grams - d.grams) > Math.max(5, d.grams * 0.1)) {
        grams.push({ said: d.said, food: d.matchName ?? f.name, drafted: d.grams, saved: f.grams });
      }
    }
  }

  const models = new Map<string, number[]>();
  for (const r of rows) {
    const k = r.model ?? "(failed)";
    const l = models.get(k) ?? [];
    if (r.latencyMs != null) l.push(r.latencyMs);
    models.set(k, l);
  }

  return {
    attempts: rows.length,
    logged: loggedRows.length,
    abandoned: rows.filter((r) => !r.logged && !r.error).length,
    errors: rows.filter((r) => r.error).length,
    latencyP50: pct(latencies, 0.5),
    latencyP95: pct(latencies, 0.95),
    costUsd: rows.reduce((s, r) => s + (r.costUsd ?? 0), 0),
    items,
    exactRate: denom ? items.kept / denom : null,
    missing: [...missing.values()].sort((a, b) => b.times - a.times),
    wrongMatches: [...wrong.values()].sort((a, b) => b.times - a.times),
    grams: grams.sort((a, b) => Math.abs(b.saved / b.drafted - 1) - Math.abs(a.saved / a.drafted - 1)),
    abandoned_: rows.filter((r) => !r.logged && !r.error).map((r) => r.text),
    errors_: rows.filter((r) => r.error).map((r) => `${r.text}: ${r.error}`),
    byModel: [...models.entries()].map(([model, l]) => ({ model, attempts: rows.filter((r) => (r.model ?? "(failed)") === model).length, p50: pct(l.sort((a, b) => a - b), 0.5) })),
  };
}

export function reportMarkdown(r: ParseReport, from: string, to: string): string {
  const lines: string[] = [];
  const s = (ms: number | null) => (ms == null ? "–" : `${(ms / 1000).toFixed(1)} s`);
  lines.push(`# Describe-food review, ${from} to ${to}`, "");
  lines.push(
    `${r.attempts} attempts: ${r.logged} logged, ${r.abandoned} abandoned, ${r.errors} failed. ` +
      `Latency ${s(r.latencyP50)} median, ${s(r.latencyP95)} p95. Cost $${r.costUsd.toFixed(4)}.`
  );
  if (r.exactRate != null) lines.push(`Logged as drafted: ${Math.round(r.exactRate * 100)}% of items.`);
  const i = r.items;
  lines.push("", `Items: ${i.drafted} drafted, ${i.unmatched} not found, ${i.kept} kept, ${i.regrammed} grams corrected, ${i.swapped} swapped, ${i.removed} removed, ${i.added} added.`);

  const section = (title: string, rows: string[]) => {
    lines.push("", `## ${title}`, "");
    lines.push(...(rows.length ? rows : ["None."]));
  };
  section("Not in the database", r.missing.map((m) => `- **${m.said}** (searched "${m.search}") ×${m.times}: ${m.examples.map((e) => `"${e}"`).join(", ")}`));
  section("Wrong match (drafted food was replaced or removed)", r.wrongMatches.map((w) => `- **${w.said}** → ${w.drafted} ×${w.times}`));
  section("Grams corrected", r.grams.slice(0, 20).map((g) => `- **${g.said}** (${g.food}): ${g.drafted} g → ${g.saved} g`));
  section("Abandoned", r.abandoned_.slice(0, 20).map((t) => `- "${t}"`));
  section("Failed", r.errors_.slice(0, 10).map((t) => `- ${t}`));
  section("By model", r.byModel.map((m) => `- ${m.model}: ${m.attempts} attempts, ${s(m.p50)} median`));
  return lines.join("\n") + "\n";
}
