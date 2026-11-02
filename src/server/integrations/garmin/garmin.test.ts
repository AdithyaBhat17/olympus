import { describe, expect, it } from "vitest";
import { Encoder, Profile, type Mesg } from "@garmin/fitsdk";
import { zipSync } from "fflate";
import { backoffMs, GarminApiError, GarminClient, jwtExp, parseTokenResponse, parseTokenText } from "./client";
import {
  chunkWindow,
  datesBetween,
  dateRequest,
  fillPath,
  GARMIN_ENDPOINTS,
  rangeRequest,
} from "./endpoints";
import { addSample, coverageRows, emptyCoverage, findFields, isEmptyDoc } from "./coverage";
import { decodeFit, extractFitFiles, hrSeries, strengthSets, summarizeFit } from "./fit";

const ep = (id: string) => GARMIN_ENDPOINTS.find((e) => e.id === id)!;

describe("endpoints", () => {
  it("fills path params and rejects missing ones", () => {
    expect(fillPath("/hrv-service/hrv/{calendarDate}", { calendarDate: "2026-11-01" })).toBe(
      "/hrv-service/hrv/2026-11-01"
    );
    expect(() => fillPath("/a/{b}", {})).toThrow();
  });

  it("builds range requests in the path or the query", () => {
    expect(rangeRequest(ep("hrv.daily"), "2026-10-01", "2026-10-30")).toEqual({
      path: "/hrv-service/hrv/daily/2026-10-01/2026-10-30",
      query: {},
    });
    expect(rangeRequest(ep("sleep.summaries"), "2026-10-01", "2026-10-30")).toEqual({
      path: "/sleep-service/sleep/dailySleepSummariesByDate",
      query: { startDate: "2026-10-01", endDate: "2026-10-30" },
    });
    expect(rangeRequest(ep("weight.range"), "2026-10-01", "2026-10-02").query).toEqual({ includeAll: true });
  });

  it("builds per-date requests", () => {
    expect(dateRequest(ep("sleep.day"), "2026-11-02")).toEqual({
      path: "/sleep-service/sleep/dailySleep",
      query: { date: "2026-11-02" },
    });
    expect(dateRequest(ep("nutrition.day"), "2026-11-02")).toEqual({
      path: "/nutrition-service/food/logs/2026-11-02",
      query: { includeGoals: true, includeNutrition: true },
    });
  });

  it("walks dates across month ends and chunks windows", () => {
    expect(datesBetween("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(chunkWindow("2026-10-01", "2026-10-17", 7)).toEqual([
      ["2026-10-01", "2026-10-07"],
      ["2026-10-08", "2026-10-14"],
      ["2026-10-15", "2026-10-17"],
    ]);
  });

  it("has unique ids", () => {
    const ids = GARMIN_ENDPOINTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("client", () => {
  it("parses token responses in either casing", () => {
    const t = parseTokenResponse({ access_token: "x", expires_in: 86400, scope: "s" }, 0);
    expect(t.accessToken).toBe("x");
    expect(t.expiresAt).toBe((86400 - 600) * 1000);
    expect(t.responseKeys).toEqual(["access_token", "expires_in", "scope"]);
    expect(parseTokenResponse({ accessToken: "y" }, 0).accessToken).toBe("y");
    expect(() => parseTokenResponse({ nope: 1 }, 0)).toThrow(/no access token/);
  });

  it("accepts a bare JWT body and reads its exp", () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const jwt = `${b64({ alg: "RS256" })}.${b64({ exp: 1000 + 86400 })}.sig`;
    expect(jwtExp(jwt)).toBe(87400);
    const t = parseTokenText(`${jwt}\n`, 1000 * 1000);
    expect(t.accessToken).toBe(jwt);
    expect(t.expiresAt).toBe(1000 * 1000 + (86400 - 600) * 1000);
    expect(parseTokenText(JSON.stringify({ access_token: "x" }), 0).accessToken).toBe("x");
    expect(() => parseTokenText("<html>nope</html>", 0)).toThrow();
  });

  it("backs off exponentially, honours Retry-After, caps", () => {
    expect(backoffMs(0, null, 0.5)).toBe(1000);
    expect(backoffMs(3, null, 0.5)).toBe(8000);
    expect(backoffMs(20, null, 0.5)).toBe(60_000);
    expect(backoffMs(0, "7")).toBe(7000);
  });

  function fakeFetch(responses: Array<() => Response>) {
    const calls: Array<{ url: string; auth: string | null; accept?: string | null }> = [];
    const impl = (async (url: string, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      calls.push({ url, auth: h.get("authorization"), ...(url.includes("/token") ? { accept: h.get("accept") } : {}) });
      const next = responses.shift();
      if (!next) throw new Error("no more responses");
      return next();
    }) as unknown as typeof fetch;
    return { impl, calls };
  }
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

  it("exchanges the key, then calls with the bearer token", async () => {
    const { impl, calls } = fakeFetch([json({ access_token: "tok", expires_in: 86400 }), json({ ok: 1 })]);
    const c = new GarminClient({ apiKey: "KEY", fetchImpl: impl, sleep: async () => {}, minIntervalMs: 0 });
    const r = await c.getJson("/x", { date: "2026-11-01", skip: undefined });
    expect(r.data).toEqual({ ok: 1 });
    expect(calls[0].auth).toBe("ApiKey KEY");
    expect(calls[0].accept).toBeNull();
    expect(calls[0].url).toMatch(/personal-api-key\/token$/);
    expect(calls[1]).toEqual({ url: "https://personal.connectapi.garmin.com/x?date=2026-11-01", auth: "Bearer tok" });
  });

  it("retries 429 and 5xx, then succeeds", async () => {
    const slept: number[] = [];
    const { impl } = fakeFetch([
      json({ access_token: "tok" }),
      json({}, 429, { "retry-after": "2" }),
      json({}, 503),
      json({ ok: 1 }),
    ]);
    const c = new GarminClient({ apiKey: "K", fetchImpl: impl, sleep: async (ms) => void slept.push(ms), minIntervalMs: 0 });
    expect((await c.getJson("/x")).data).toEqual({ ok: 1 });
    expect(slept[0]).toBe(2000);
    expect(slept).toHaveLength(2);
  });

  it("gets a fresh token once on 401", async () => {
    const { impl, calls } = fakeFetch([
      json({ access_token: "old" }),
      json({}, 401),
      json({ access_token: "new" }),
      json({ ok: 1 }),
    ]);
    const c = new GarminClient({ apiKey: "K", fetchImpl: impl, sleep: async () => {}, minIntervalMs: 0 });
    await c.getJson("/x");
    expect(calls.map((c) => c.auth)).toEqual(["ApiKey K", "Bearer old", "ApiKey K", "Bearer new"]);
  });

  it("throws a GarminApiError on a 4xx without retrying", async () => {
    const { impl, calls } = fakeFetch([json({ access_token: "t" }), json({ error: "bad range" }, 400)]);
    const c = new GarminClient({ apiKey: "K", fetchImpl: impl, sleep: async () => {}, minIntervalMs: 0 });
    await expect(c.getJson("/x")).rejects.toBeInstanceOf(GarminApiError);
    expect(calls).toHaveLength(2);
  });
});

describe("coverage", () => {
  it("folds array items and date keys, counts filled vs seen, keeps no values", () => {
    const cov = emptyCoverage();
    addSample(cov, { hrvSummary: { lastNightAvg: 52, status: "BALANCED" }, readings: [{ v: 1 }, { v: 2 }], byDay: { "2026-11-01": 3 } });
    addSample(cov, { hrvSummary: { lastNightAvg: null, status: "BALANCED" }, readings: [] });
    const rows = Object.fromEntries(coverageRows(cov).map((r) => [r.path, r]));
    expect(rows["hrvSummary.lastNightAvg"]).toEqual({ path: "hrvSummary.lastNightAvg", filledPct: 50, types: "number" });
    expect(rows["readings[].v"].filledPct).toBe(50);
    expect(rows["byDay.{key}"].filledPct).toBe(50);
    expect(JSON.stringify(rows)).not.toContain("BALANCED");
    expect(findFields(cov, /hrv|night/i).map((r) => r.path)).toEqual(["hrvSummary", "hrvSummary.lastNightAvg"]);
  });

  it("spots empty responses", () => {
    expect(isEmptyDoc(null)).toBe(true);
    expect(isEmptyDoc([])).toBe(true);
    expect(isEmptyDoc({ a: null, b: [] })).toBe(true);
    expect(isEmptyDoc({ a: 0 })).toBe(false);
  });
});

describe("FIT", () => {
  function strengthFit(): Uint8Array {
    const start = new Date("2026-11-01T05:00:00Z");
    const enc = new Encoder();
    const put = (num: number, m: Record<string, unknown>) => enc.onMesg(num, m as Mesg);
    put(Profile.MesgNum.FILE_ID, { manufacturer: "garmin", product: 1, timeCreated: start, type: "activity" });
    for (let i = 0; i < 5; i++) {
      put(Profile.MesgNum.RECORD, { timestamp: new Date(start.getTime() + i * 1000), heartRate: 100 + i });
    }
    put(Profile.MesgNum.SET, {
      timestamp: new Date(start.getTime() + 60_000),
      startTime: start,
      duration: 40,
      setType: "active",
      repetitions: 8,
      weight: 80,
      category: ["squat"],
    });
    put(Profile.MesgNum.SET, { timestamp: new Date(start.getTime() + 180_000), duration: 120, setType: "rest" });
    put(Profile.MesgNum.SESSION, {
      timestamp: new Date(start.getTime() + 180_000),
      startTime: start,
      sport: "training",
      subSport: "strengthTraining",
      totalElapsedTime: 180,
    });
    return enc.close();
  }

  it("unzips, decodes and extracts HR and sets", () => {
    const zip = zipSync({ "123_ACTIVITY.fit": strengthFit(), "readme.txt": new Uint8Array([1]) });
    const files = extractFitFiles(zip);
    expect(files.map((f) => f.name)).toEqual(["123_ACTIVITY.fit"]);

    const fit = decodeFit(files[0].name, files[0].bytes);
    expect(fit.errors).toEqual([]);
    expect(hrSeries(fit.messages).map((s) => s.bpm)).toEqual([100, 101, 102, 103, 104]);

    const sets = strengthSets(fit.messages);
    expect(sets[0]).toMatchObject({ setType: "active", reps: 8, weightKg: 80, category: "squat", durationSec: 40 });
    expect(sets[1].setType).toBe("rest");

    const sum = summarizeFit(fit);
    expect(sum.hr).toEqual({ samples: 5, medianIntervalSec: 1, coverageSec: 4 });
    expect(sum.sets).toEqual({ total: 2, active: 1, withReps: 1, withWeight: 1, withCategory: 1 });
    expect(sum.sport).toBe("training");
    expect(sum.subSport).toBe("strengthTraining");
    expect(sum.fieldsByMessage.recordMesgs).toContain("heartRate");
  });

  it("accepts a bare FIT and rejects junk", () => {
    expect(extractFitFiles(strengthFit())).toHaveLength(1);
    expect(decodeFit("x", new Uint8Array([1, 2, 3])).errors).toEqual(["not a FIT file"]);
  });
});
