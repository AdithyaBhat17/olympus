import { Decoder, Stream } from "@garmin/fitsdk";
import { unzipSync } from "fflate";
import type { FitLap } from "@/lib/db/schema";

/**
 * Activity downloads come back as a ZIP holding one FIT file. This unzips
 * it, decodes the FIT with Garmin's SDK and pulls out what Olympus uses:
 * 1 Hz heart rate, laps, and strength sets (exercise, reps, weight).
 */

export type FitMessages = Record<string, Array<Record<string, unknown>>>;

export interface DecodedFit {
  name: string;
  messages: FitMessages;
  errors: string[];
}

/** FIT files inside a ZIP. A bare FIT (no ZIP wrapper) is accepted too. */
export function extractFitFiles(bytes: Uint8Array): Array<{ name: string; bytes: Uint8Array }> {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return [{ name: "activity.fit", bytes }];
  const files = unzipSync(bytes);
  return Object.entries(files)
    .filter(([name]) => name.toLowerCase().endsWith(".fit"))
    .map(([name, b]) => ({ name, bytes: b }));
}

export function decodeFit(name: string, bytes: Uint8Array): DecodedFit {
  const stream = Stream.fromByteArray(bytes);
  if (!Decoder.isFIT(stream)) return { name, messages: {}, errors: ["not a FIT file"] };
  const decoder = new Decoder(stream);
  const { messages, errors } = decoder.read({
    convertDateTimesToDates: true,
    convertTypesToStrings: true,
    includeUnknownData: false,
    mergeHeartRates: true,
  });
  return {
    name,
    messages: messages as unknown as FitMessages,
    errors: (errors as unknown[]).map((e) => String(e instanceof Error ? e.message : e)),
  };
}

export interface HrSample {
  /** Epoch seconds. */
  t: number;
  bpm: number;
}

export function hrSeries(messages: FitMessages): HrSample[] {
  const out: HrSample[] = [];
  for (const r of messages.recordMesgs ?? []) {
    const ts = r.timestamp;
    const bpm = r.heartRate;
    if (ts instanceof Date && typeof bpm === "number" && bpm > 0) {
      out.push({ t: Math.round(ts.getTime() / 1000), bpm });
    }
  }
  return out;
}

export interface StrengthSet {
  startTime: string | null;
  durationSec: number | null;
  setType: string | null;
  category: string | null;
  reps: number | null;
  weightKg: number | null;
}

/** Strength sets as the watch recorded them. Rest "sets" are kept with setType "rest". */
export function strengthSets(messages: FitMessages): StrengthSet[] {
  return (messages.setMesgs ?? []).map((s) => {
    const cat = s.category;
    return {
      startTime: s.startTime instanceof Date ? s.startTime.toISOString() : null,
      durationSec: typeof s.duration === "number" ? s.duration : null,
      setType: typeof s.setType === "string" ? s.setType : null,
      category: Array.isArray(cat) ? (cat.filter((c) => c != null).join("/") || null) : typeof cat === "string" ? cat : null,
      reps: typeof s.repetitions === "number" ? s.repetitions : null,
      weightKg: typeof s.weight === "number" ? s.weight : null,
    };
  });
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface FitSummary {
  /** Message type → count, e.g. recordMesgs: 3600. */
  messageCounts: Record<string, number>;
  /** Message type → field names that are non-null in at least one message. */
  fieldsByMessage: Record<string, string[]>;
  hr: { samples: number; medianIntervalSec: number | null; coverageSec: number | null };
  sets: { total: number; active: number; withReps: number; withWeight: number; withCategory: number };
  sport: string | null;
  subSport: string | null;
  errors: string[];
}

/** Structure only, no values, for the discovery report. */
export function summarizeFit(fit: DecodedFit): FitSummary {
  const messageCounts: Record<string, number> = {};
  const fieldsByMessage: Record<string, string[]> = {};
  for (const [type, list] of Object.entries(fit.messages)) {
    messageCounts[type] = list.length;
    const fields = new Set<string>();
    for (const m of list) for (const [k, v] of Object.entries(m)) if (v != null) fields.add(k);
    fieldsByMessage[type] = [...fields].sort();
  }
  const hr = hrSeries(fit.messages);
  const gaps = hr.slice(1).map((s, i) => s.t - hr[i].t);
  const sets = strengthSets(fit.messages);
  const active = sets.filter((s) => s.setType !== "rest");
  const session = fit.messages.sessionMesgs?.[0];
  return {
    messageCounts,
    fieldsByMessage,
    hr: {
      samples: hr.length,
      medianIntervalSec: median(gaps),
      coverageSec: hr.length > 1 ? hr[hr.length - 1].t - hr[0].t : null,
    },
    sets: {
      total: sets.length,
      active: active.length,
      withReps: active.filter((s) => s.reps != null).length,
      withWeight: active.filter((s) => s.weightKg != null && s.weightKg > 0).length,
      withCategory: active.filter((s) => s.category != null).length,
    },
    sport: typeof session?.sport === "string" ? session.sport : null,
    subSport: typeof session?.subSport === "string" ? session.subSport : null,
    errors: fit.errors,
  };
}

export function fitLaps(messages: FitMessages): FitLap[] {
  return (messages.lapMesgs ?? [])
    .filter((l) => l.startTime instanceof Date)
    .map((l) => ({
      start: (l.startTime as Date).toISOString(),
      durationSec: typeof l.totalElapsedTime === "number" ? Math.round(l.totalElapsedTime) : null,
      avgHr: typeof l.avgHeartRate === "number" ? l.avgHeartRate : null,
      maxHr: typeof l.maxHeartRate === "number" ? l.maxHeartRate : null,
      distanceM: typeof l.totalDistance === "number" ? Math.round(l.totalDistance) : null,
    }));
}

/** Session totals worth keeping, plus the session's time in HR zones (seconds per zone). */
export function fitMeta(messages: FitMessages): Record<string, unknown> {
  const s = messages.sessionMesgs?.[0] ?? {};
  const keep = [
    "sport",
    "subSport",
    "totalElapsedTime",
    "totalTimerTime",
    "totalCalories",
    "avgHeartRate",
    "maxHeartRate",
    "totalTrainingEffect",
    "totalAnaerobicTrainingEffect",
    "trainingLoadPeak",
    "totalDistance",
    "totalAscent",
  ];
  const meta: Record<string, unknown> = {};
  for (const k of keep) if (s[k] != null) meta[k] = s[k];
  const zone = (messages.timeInZoneMesgs ?? []).find((z) => z.referenceMesg === "session");
  if (zone && Array.isArray(zone.timeInHrZone)) {
    meta.timeInHrZoneSec = (zone.timeInHrZone as unknown[]).map((v) => (typeof v === "number" ? Math.round(v) : null));
    if (Array.isArray(zone.hrZoneHighBoundary)) meta.hrZoneHighBoundary = zone.hrZoneHighBoundary;
  }
  return meta;
}

/** HR as offsets from the first sample, for activity_streams. */
export function packHr(series: HrSample[]): { start: Date | null; t: number[]; bpm: number[] } {
  if (!series.length) return { start: null, t: [], bpm: [] };
  const t0 = series[0].t;
  return { start: new Date(t0 * 1000), t: series.map((s) => s.t - t0), bpm: series.map((s) => s.bpm) };
}

/** Minutes with at least one HR sample: what hr_covered_min means for Apple Health too. */
export function hrCoveredMin(series: HrSample[]): number {
  return new Set(series.map((s) => Math.floor(s.t / 60))).size;
}
