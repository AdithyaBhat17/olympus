import { formatKg, formatLoad } from "./load";
import { formatSleep } from "./recovery";
import { TARGETS } from "./targets";
import type { LoadMode, SetLogEntry } from "./types";

export interface ExportExercise {
  name: string;
  loadMode: LoadMode;
  sets: SetLogEntry[];
  notes?: string | null;
  straps?: boolean;
}

export interface ExportSession {
  date: string; // YYYY-MM-DD
  sessionType?: string | null;
  title: string;
  exercises: ExportExercise[];
  notes?: string | null;
  checkIn?: { sleepMin: number | null; proteinG: number | null; waterMl: number | null } | null;
}

function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function sessionFileName(s: Pick<ExportSession, "date" | "sessionType" | "title">): string {
  return `${s.date} ${s.sessionType ? `Session ${s.sessionType}` : s.title}.md`;
}

function weightCell(ex: ExportExercise): string {
  if (ex.loadMode === "TIME") {
    const hr = ex.sets.map((s) => s.avgHr).filter((h): h is number => h != null);
    return hr.length ? `avg HR ${Math.round(hr.reduce((a, b) => a + b, 0) / hr.length)}` : "—";
  }
  const working = ex.sets.filter((s) => s.type !== "warmup");
  const pool = working.length ? working : ex.sets;
  const distinct = Array.from(new Set(pool.map((s) => s.weight)));
  if (distinct.length === 1) return formatLoad(ex.loadMode, distinct[0]);
  return pool.map((s) => formatKg(s.weight)).join("/");
}

function rpeCell(sets: SetLogEntry[]): string {
  const rpes = sets.map((s) => s.rpe).filter((r): r is number => r != null);
  return rpes.length ? formatKg(Math.max(...rpes)) : "";
}

function notesCell(ex: ExportExercise): string {
  const bits: string[] = [];
  if (ex.straps) bits.push("Straps");
  if (ex.sets.some((s) => s.flags?.includes("top_set_pr"))) bits.push("Top set ↑");
  ex.sets.forEach((s, i) => {
    if (s.flags?.includes("underloaded")) bits.push(`S${i + 1} underloaded`);
  });
  if (ex.sets.some((s) => s.flags?.includes("blocked_override"))) bits.push("Blocked override");
  if (ex.notes) bits.push(ex.notes);
  return bits.join(". ").replace(/\|/g, "/");
}

/** One session in the Lift Log / Obsidian format. */
export function renderSessionMarkdown(s: ExportSession): string {
  const heading = `${ddmmyyyy(s.date)} — ${s.sessionType ? `Session ${s.sessionType}: ` : ""}${s.title}`;
  const rows = s.exercises.map((ex) => {
    const working = ex.sets.filter((x) => x.type !== "warmup");
    const pool = working.length ? working : ex.sets;
    const reps =
      ex.loadMode === "TIME"
        ? pool.map((x) => `${x.reps} min`).join(", ")
        : pool.map((x) => x.reps).join(", ");
    return `| ${ex.name} | ${reps} | ${weightCell(ex)} | ${rpeCell(pool)} | ${notesCell(ex)} |`;
  });
  const lines = [
    `## ${heading}`,
    "",
    "| Exercise | Sets x Reps | Weight | RPE | Notes |",
    "|---|---|---|---|---|",
    ...rows,
  ];
  const c = s.checkIn;
  if (c) {
    lines.push(
      "",
      [
        `Sleep ${c.sleepMin != null ? formatSleep(c.sleepMin).replace("h ", ":") : "—"}`,
        `Protein ${c.proteinG ?? "—"}/${TARGETS.proteinG} g`,
        `Water ${c.waterMl != null ? (c.waterMl / 1000).toFixed(1) : "—"}/${(TARGETS.waterMl / 1000).toFixed(1)} L`,
      ].join(" · ")
    );
  }
  if (s.notes?.trim()) lines.push("", `Session notes: ${s.notes.trim()}`);
  return lines.join("\n") + "\n";
}

/** The whole log, newest first, for liftlog://log/latest.md. */
export function renderLogMarkdown(sessions: ExportSession[]): string {
  return [
    "# Lift Log",
    "",
    `_Generated from Olympus on ${new Date().toISOString().slice(0, 10)}._`,
    "",
    ...sessions.map(renderSessionMarkdown),
  ].join("\n");
}
