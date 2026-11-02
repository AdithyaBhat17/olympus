/**
 * Garmin Personal API data discovery.
 *
 * Calls every documented endpoint for the last N days (default 30), saves
 * each raw response under .garmin-discovery/ (gitignored: it's health data),
 * and writes a report of which fields actually come back for this athlete's
 * devices: field paths, how often they're filled, and their types. The report
 * holds no values, so it can be committed.
 *
 *   GARMIN_API_KEY=... pnpm garmin:discover [--days 30] [--max-activities 40]
 *
 * The key can also live in .env.local as GARMIN_API_KEY. It's only ever
 * sent to Garmin.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GarminApiError, GarminClient } from "../../src/server/integrations/garmin/client";
import {
  ACTIVITY_LIST_PATH,
  addDaysIso,
  chunkWindow,
  dateRequest,
  datesBetween,
  fillPath,
  GARMIN_ENDPOINTS,
  rangeRequest,
  SKIPPED_ENDPOINTS,
  type GarminEndpoint,
} from "../../src/server/integrations/garmin/endpoints";
import {
  addSample,
  coverageRows,
  emptyCoverage,
  findFields,
  isEmptyDoc,
  type Coverage,
} from "../../src/server/integrations/garmin/coverage";
import { decodeFit, extractFitFiles, summarizeFit, type FitSummary } from "../../src/server/integrations/garmin/fit";

// --- args & env --------------------------------------------------------------

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) {
    try {
      process.loadEnvFile(f);
    } catch {
      /* unreadable env file: rely on the real environment */
    }
  }
}

const apiKey = process.env.GARMIN_API_KEY?.trim();
if (!apiKey) {
  console.error("Set GARMIN_API_KEY (environment or .env.local). Create one at https://connect.garmin.com/app/settings/personalApiToken");
  process.exit(1);
}

const DAYS = Number(arg("days", "30"));
const MAX_ACTIVITIES = Number(arg("max-activities", "40"));
const OUT = arg("out", ".garmin-discovery");
const REPORT = arg("report", "docs/companion/garmin-discovery.md");
const TZ = arg("tz", Intl.DateTimeFormat().resolvedOptions().timeZone);

const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const from = addDaysIso(today, -(DAYS - 1));

// --- bookkeeping ---------------------------------------------------------------

interface EndpointResult {
  id: string;
  path: string;
  why: string;
  calls: number;
  ok: number;
  empty: number;
  statuses: Record<string, number>;
  errors: string[];
  latencies: number[];
  coverage: Coverage;
  notes: string[];
}

const results = new Map<string, EndpointResult>();
function result(id: string, p: string, why: string): EndpointResult {
  let r = results.get(id);
  if (!r) {
    r = { id, path: p, why, calls: 0, ok: 0, empty: 0, statuses: {}, errors: [], latencies: [], coverage: emptyCoverage(), notes: [] };
    results.set(id, r);
  }
  return r;
}

function save(id: string, label: string, data: unknown) {
  const dir = path.join(OUT, "raw", id);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${label.replace(/[^\w.-]+/g, "_")}`);
  if (data instanceof Uint8Array) writeFileSync(file, data);
  else writeFileSync(`${file}.json`, JSON.stringify(data, null, 1));
}

/** Arrays of per-day items count each item as one sample. */
function addDoc(r: EndpointResult, doc: unknown) {
  if (isEmptyDoc(doc)) r.empty++;
  if (Array.isArray(doc)) for (const item of doc) addSample(r.coverage, item);
  else if (!isEmptyDoc(doc)) addSample(r.coverage, doc);
}

const client = new GarminClient({ apiKey, minIntervalMs: 500 });

async function call(
  r: EndpointResult,
  label: string,
  p: string,
  query: Record<string, string | boolean | number> = {}
): Promise<unknown | undefined> {
  r.calls++;
  try {
    const res = await client.getJson(p, query);
    r.ok++;
    r.statuses[res.status] = (r.statuses[res.status] ?? 0) + 1;
    r.latencies.push(res.latencyMs);
    save(r.id, label, res.data);
    addDoc(r, res.data);
    return res.data;
  } catch (err) {
    const status = err instanceof GarminApiError ? err.status : "network";
    r.statuses[status] = (r.statuses[status] ?? 0) + 1;
    const body = err instanceof GarminApiError ? err.body.replace(/\s+/g, " ").slice(0, 160) : String(err);
    if (r.errors.length < 3) r.errors.push(`${label}: ${status} ${body}`);
    if (err instanceof GarminApiError) throw err;
    return undefined;
  }
}

const log = (s: string) => process.stderr.write(`${s}\n`);

// --- run -----------------------------------------------------------------------

async function main() {
  log(`Garmin discovery ${from} → ${today} (${TZ}), output ${OUT}/`);
  mkdirSync(OUT, { recursive: true });

  const token = await client.getToken();
  const tokenNote = `Token response fields: ${token.responseKeys.join(", ")}. Valid for ~${Math.round((token.expiresAt - Date.now()) / 3600_000 + 10 / 60)} h.`;
  log(tokenNote);

  for (const ep of GARMIN_ENDPOINTS) {
    if (ep.shape.kind === "activity") continue;
    const r = result(ep.id, ep.path, ep.why);
    log(`· ${ep.id}`);
    try {
      await runEndpoint(ep, r);
    } catch {
      /* recorded in r.errors */
    }
  }

  const fits = await runActivities();
  const report = renderReport(tokenNote, fits);
  mkdirSync(path.dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, report);
  writeFileSync(path.join(OUT, "report.md"), report);
  log(`\nReport: ${REPORT}\nRaw responses: ${OUT}/raw/`);
}

async function runEndpoint(ep: GarminEndpoint, r: EndpointResult) {
  const s = ep.shape;
  switch (s.kind) {
    case "once":
      await call(r, "once", ep.path, s.query ?? {});
      return;
    case "onceForDate": {
      const req = dateRequest(ep, today);
      await call(r, today, req.path, req.query);
      return;
    }
    case "daily": {
      const days = datesBetween(addDaysIso(today, -((s.sampleDays ?? DAYS) - 1)), today);
      for (const d of days) {
        const req = dateRequest(ep, d);
        try {
          await call(r, d, req.path, req.query);
        } catch (err) {
          // A 4xx on one day (no data) shouldn't stop the rest, but 5 in a row means the endpoint is out.
          if (r.ok === 0 && r.calls >= 5) {
            r.notes.push(`Stopped after ${r.calls} failing days.`);
            return;
          }
          void err;
        }
      }
      return;
    }
    case "range": {
      // Whole window first; if Garmin rejects it, find a window size it accepts.
      try {
        const req = rangeRequest(ep, from, today);
        await call(r, `${from}_${today}`, req.path, req.query);
        r.notes.push(`Accepted a ${DAYS}-day window in one call.`);
        return;
      } catch (err) {
        if (!(err instanceof GarminApiError) || err.status >= 500 || err.status === 401 || err.status === 403) return;
      }
      for (const size of [28, 7, 1]) {
        if (size >= DAYS) continue;
        const chunks = chunkWindow(from, today, size);
        try {
          for (const [a, b] of chunks) {
            const req = rangeRequest(ep, a, b);
            await call(r, `${a}_${b}`, req.path, req.query);
          }
          r.notes.push(`Rejected ${DAYS} days; accepted ${size}-day windows.`);
          return;
        } catch {
          /* try a smaller window */
        }
      }
      r.notes.push("Rejected every window size tried (28, 7, 1 days).");
      return;
    }
  }
}

interface FitResult {
  activityId: number;
  type: string;
  summary: FitSummary | null;
  error?: string;
}

async function runActivities(): Promise<FitResult[]> {
  const list = result("activity.list", ACTIVITY_LIST_PATH, "activities in the window");
  log("· activity.list");
  const activities: Array<Record<string, unknown>> = [];
  for (let start = 0; ; start += 100) {
    let page: unknown;
    try {
      page = await call(list, `page_${start}`, ACTIVITY_LIST_PATH, {
        startDate: from,
        endDate: today,
        start,
        limit: 100,
        sortOrder: "desc",
      });
    } catch {
      break;
    }
    const items = Array.isArray(page) ? page : [];
    activities.push(...(items as Array<Record<string, unknown>>));
    if (items.length < 100) break;
  }
  list.notes.push(`${activities.length} activities in ${DAYS} days.`);

  const types = new Map<string, number>();
  for (const a of activities) {
    const t = activityType(a);
    types.set(t, (types.get(t) ?? 0) + 1);
  }
  list.notes.push(`By type: ${[...types].map(([t, n]) => `${t} ${n}`).join(", ") || "none"}.`);

  // Every type at least once, then the newest, up to MAX_ACTIVITIES.
  const picked: Array<Record<string, unknown>> = [];
  const seenTypes = new Set<string>();
  for (const a of activities) if (!seenTypes.has(activityType(a))) (seenTypes.add(activityType(a)), picked.push(a));
  for (const a of activities) if (picked.length < MAX_ACTIVITIES && !picked.includes(a)) picked.push(a);

  const fits: FitResult[] = [];
  const byId = (id: string) => GARMIN_ENDPOINTS.find((e) => e.id === id)!;
  for (const a of picked) {
    const id = Number(a.activityId);
    if (!Number.isFinite(id)) continue;
    const type = activityType(a);
    log(`· activity ${id} (${type})`);
    for (const epId of ["activity.detail", "activity.workouts"]) {
      const ep = byId(epId);
      try {
        await call(result(ep.id, ep.path, ep.why), String(id), fillPath(ep.path, { activityId: id }));
      } catch {
        /* recorded */
      }
    }
    const fileEp = byId("activity.file");
    const fr = result(fileEp.id, fileEp.path, fileEp.why);
    fr.calls++;
    try {
      const res = await client.getBytes(fillPath(fileEp.path, { activityId: id }));
      fr.ok++;
      fr.statuses[res.status] = (fr.statuses[res.status] ?? 0) + 1;
      fr.latencies.push(res.latencyMs);
      save(fileEp.id, `${id}.zip`, res.data);
      const files = extractFitFiles(res.data);
      if (!files.length) {
        fits.push({ activityId: id, type, summary: null, error: "ZIP had no .fit" });
        continue;
      }
      fits.push({ activityId: id, type, summary: summarizeFit(decodeFit(files[0].name, files[0].bytes)) });
    } catch (err) {
      const status = err instanceof GarminApiError ? err.status : "error";
      fr.statuses[status] = (fr.statuses[status] ?? 0) + 1;
      if (fr.errors.length < 3) fr.errors.push(`${id}: ${status} ${err instanceof Error ? err.message : String(err)}`.slice(0, 200));
      fits.push({ activityId: id, type, summary: null, error: String(status) });
    }
  }
  return fits;
}

function activityType(a: Record<string, unknown>): string {
  const t = a.activityType as { typeKey?: string } | undefined;
  return t?.typeKey ?? "unknown";
}

// --- report --------------------------------------------------------------------

function p50(xs: number[]): string {
  if (!xs.length) return "–";
  const s = [...xs].sort((a, b) => a - b);
  return `${s[s.length >> 1]} ms`;
}

/** The questions the feature list depends on, as field-name searches. */
const QUESTIONS: Array<{ q: string; re: RegExp; endpoints?: string[] }> = [
  { q: "Overnight HRV", re: /hrv|lastNight|weeklyAvg|baseline/i, endpoints: ["hrv.daily", "hrv.day", "summary.v2"] },
  { q: "Resting HR", re: /resting/i },
  { q: "Sleep stages", re: /deep|rem|light|awake/i, endpoints: ["sleep.summaries", "sleep.day"] },
  { q: "Sleep score / need", re: /score|need/i, endpoints: ["sleep.summaries", "sleep.day"] },
  { q: "Sleep timing", re: /start|end|bed|wake/i, endpoints: ["sleep.summaries", "sleep.day"] },
  { q: "Skin temperature", re: /skin|temp/i },
  { q: "Respiration", re: /respiration|breath/i },
  { q: "SpO2 / pulse ox", re: /spo2|pulseOx|oxygen/i },
  { q: "Stress", re: /stress/i, endpoints: ["stress.daily", "summary.v2", "summary.day"] },
  { q: "Body Battery", re: /bodyBattery|charged|drained/i },
  { q: "Jet lag", re: /jetLag|timezone|timeZone/i },
  { q: "Weight / body comp", re: /weight|bodyFat|muscle|bmi|visceral/i, endpoints: ["weight.range", "weight.all"] },
  { q: "Training effect / VO2 / load on activities", re: /trainingEffect|vO2|vo2|load|recovery/i, endpoints: ["activity.list", "activity.detail"] },
  { q: "HR zones on activities", re: /zone/i, endpoints: ["activity.detail", "wellness.activity", "hr.zones"] },
  { q: "Strength sets in activity JSON", re: /exerciseSet|summarizedExercise|reps|repetition/i, endpoints: ["activity.detail", "activity.list"] },
];

function renderReport(tokenNote: string, fits: FitResult[]): string {
  const lines: string[] = [];
  const all = [...results.values()];
  lines.push(
    "# Garmin Personal API: discovery report",
    "",
    `Generated ${new Date().toISOString()} for ${from} → ${today} (${TZ}) by \`scripts/garmin/discover.ts\`.`,
    "Field names and fill rates only; no values. Raw responses are in `.garmin-discovery/raw/` on the machine that ran it (gitignored).",
    "",
    tokenNote,
    "",
    "## Key questions",
    "",
    "Fields whose name matches each question, with the share of samples where they were filled. Read with the endpoint tables below.",
    ""
  );
  for (const { q, re, endpoints } of QUESTIONS) {
    const hits: string[] = [];
    for (const r of all) {
      if (endpoints && !endpoints.includes(r.id)) continue;
      for (const row of findFields(r.coverage, re)) {
        if (row.types === "object" || row.types === "array") continue;
        hits.push(`\`${r.id}\` ${row.path} (${row.filledPct}%)`);
      }
    }
    lines.push(`- **${q}:** ${hits.length ? hits.slice(0, 12).join("; ") + (hits.length > 12 ? `; +${hits.length - 12} more` : "") : "_no matching fields_"}`);
  }

  lines.push("", "## FIT files", "");
  if (!fits.length) lines.push("_No activities in the window._");
  else {
    lines.push("| Activity type | Sport / sub-sport | HR samples | Median HR interval | Sets (active / reps / weight / exercise) | Messages | Errors |", "|---|---|---|---|---|---|---|");
    for (const f of fits) {
      const s = f.summary;
      if (!s) {
        lines.push(`| ${f.type} | – | – | – | – | – | ${f.error ?? ""} |`);
        continue;
      }
      const msgs = Object.entries(s.messageCounts).map(([k, n]) => `${k.replace(/Mesgs$/, "")} ${n}`).join(", ");
      lines.push(
        `| ${f.type} | ${s.sport ?? "?"} / ${s.subSport ?? "?"} | ${s.hr.samples} | ${s.hr.medianIntervalSec ?? "–"} s | ${s.sets.active} / ${s.sets.withReps} / ${s.sets.withWeight} / ${s.sets.withCategory} | ${msgs} | ${s.errors.length ? s.errors.join("; ").slice(0, 80) : ""} |`
      );
    }
    const sessionFields = new Set<string>();
    for (const f of fits) for (const k of f.summary?.fieldsByMessage.sessionMesgs ?? []) sessionFields.add(k);
    lines.push("", `Session fields present in any FIT: ${[...sessionFields].sort().join(", ") || "none"}.`);
    const stripped = ["totalTrainingEffect", "totalAnaerobicTrainingEffect", "trainingLoadPeak", "enhancedAvgSpeed"].filter((k) => !sessionFields.has(k));
    lines.push(`Checked for possibly-stripped session fields: ${stripped.length ? `missing ${stripped.join(", ")}` : "all present"}.`);
  }

  lines.push("", "## Endpoints", "", "| Endpoint | Calls | OK | Empty | Statuses | p50 latency | Notes |", "|---|---|---|---|---|---|---|");
  for (const r of all) {
    const st = Object.entries(r.statuses).map(([k, n]) => `${k}×${n}`).join(" ");
    lines.push(`| \`${r.id}\` | ${r.calls} | ${r.ok} | ${r.empty} | ${st} | ${p50(r.latencies)} | ${[...r.notes, ...r.errors].join(" ").replace(/\|/g, "/")} |`);
  }
  lines.push("", `Not called: ${SKIPPED_ENDPOINTS.map((p) => `\`${p}\``).join(", ")} (women's health).`);

  lines.push("", "## Fields per endpoint", "");
  for (const r of all) {
    const rows = coverageRows(r.coverage).filter((x) => x.types !== "object" && x.types !== "array");
    lines.push(`<details><summary><code>${r.id}</code>: ${r.path} (${r.coverage.samples} samples, ${rows.length} fields)</summary>`, "", `_${r.why}_`, "");
    if (rows.length) {
      lines.push("| Field | Filled | Type |", "|---|---|---|");
      for (const row of rows) lines.push(`| ${row.path} | ${row.filledPct}% | ${row.types} |`);
    } else lines.push("_No data._");
    lines.push("", "</details>", "");
  }
  return lines.join("\n");
}

main().catch((err) => {
  console.error(err instanceof GarminApiError ? `${err.message}: ${err.body}` : err);
  process.exit(1);
});
