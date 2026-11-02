/**
 * Field coverage for the discovery report: which JSON paths come back, how
 * often they're non-null, and what type they hold. Never records values, so
 * the report is safe to commit.
 *
 * Paths normalise array indexes to `[]` and date- or number-like object keys
 * to `{key}`, so 30 nights of data fold into one set of paths.
 */

export type JsonType = "null" | "boolean" | "number" | "string" | "array" | "object";

export interface FieldStat {
  /** Samples (documents) the path appeared in at all. */
  seen: number;
  /** Samples where it held something other than null / "" / []. */
  filled: number;
  types: Set<JsonType>;
}

export interface Coverage {
  samples: number;
  fields: Map<string, FieldStat>;
}

export function emptyCoverage(): Coverage {
  return { samples: 0, fields: new Map() };
}

function typeOf(v: unknown): JsonType {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "array";
  const t = typeof v;
  if (t === "boolean" || t === "number" || t === "string") return t;
  return "object";
}

const DYNAMIC_KEY = /^(\d{4}-\d{2}-\d{2}.*|\d+)$/;

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Every path in `doc` with its (first-seen) type and whether it's filled. */
export function collectPaths(doc: unknown, maxDepth = 8): Map<string, { type: JsonType; filled: boolean }> {
  const out = new Map<string, { type: JsonType; filled: boolean }>();
  const visit = (v: unknown, path: string, depth: number) => {
    const type = typeOf(v);
    if (path) {
      const prev = out.get(path);
      const filled = !isEmpty(v);
      if (!prev) out.set(path, { type, filled });
      else if (filled && !prev.filled) out.set(path, { type: prev.type === "null" ? type : prev.type, filled });
    }
    if (depth >= maxDepth) return;
    if (type === "array") {
      for (const item of v as unknown[]) visit(item, `${path}[]`, depth + 1);
    } else if (type === "object") {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        const key = DYNAMIC_KEY.test(k) ? "{key}" : k;
        visit(child, path ? `${path}.${key}` : key, depth + 1);
      }
    }
  };
  visit(doc, "", 0);
  return out;
}

/** Add one sample (one response document) to `cov`. */
export function addSample(cov: Coverage, doc: unknown): void {
  cov.samples++;
  for (const [path, { type, filled }] of collectPaths(doc)) {
    let stat = cov.fields.get(path);
    if (!stat) cov.fields.set(path, (stat = { seen: 0, filled: 0, types: new Set() }));
    stat.seen++;
    if (filled) stat.filled++;
    if (type !== "null") stat.types.add(type);
  }
}

/** Is a response empty (null, {}, [], or an object of only empty values)? */
export function isEmptyDoc(doc: unknown): boolean {
  if (isEmpty(doc)) return true;
  if (typeOf(doc) === "object") return Object.values(doc as object).every((v) => isEmpty(v));
  return false;
}

export interface CoverageRow {
  path: string;
  /** Filled in this share of samples, 0-100. */
  filledPct: number;
  types: string;
}

/** Rows sorted by path. Leaf-ish rows only: containers are kept when they never fill. */
export function coverageRows(cov: Coverage): CoverageRow[] {
  return [...cov.fields.entries()]
    .map(([path, s]) => ({
      path,
      filledPct: cov.samples ? Math.round((s.filled / cov.samples) * 100) : 0,
      types: [...s.types].sort().join("|") || "null",
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Paths whose name matches `re`, with how often they're filled. */
export function findFields(cov: Coverage, re: RegExp): CoverageRow[] {
  return coverageRows(cov).filter((r) => re.test(r.path.split(".").pop() ?? r.path));
}
