import { describe, expect, it } from "vitest";
import {
  filterSyncPatch,
  hrvMethod,
  syncOutranks,
  type ExistingCheckIn,
} from "../check-in-sources";

const existing = (over: Partial<ExistingCheckIn> = {}): ExistingCheckIn => ({
  sources: {},
  proteinG: null,
  waterMl: null,
  sleepDetailSource: null,
  ...over,
});

describe("syncOutranks", () => {
  it("orders devices Garmin > Whoop > Apple Health", () => {
    expect(syncOutranks("garmin", "whoop")).toBe(true);
    expect(syncOutranks("garmin", "apple_health")).toBe(true);
    expect(syncOutranks("whoop", "apple_health")).toBe(true);
    expect(syncOutranks("whoop", "garmin")).toBe(false);
    expect(syncOutranks("apple_health", "garmin")).toBe(false);
    expect(syncOutranks("apple_health", "whoop")).toBe(false);
  });

  it("lets a source refresh its own value", () => {
    expect(syncOutranks("apple_health", "apple_health")).toBe(true);
    expect(syncOutranks("garmin", "garmin")).toBe(true);
  });

  it("never overwrites a human value", () => {
    expect(syncOutranks("garmin", "manual")).toBe(false);
    expect(syncOutranks("garmin", "claude")).toBe(false);
  });

  it("fills an empty field", () => {
    expect(syncOutranks("apple_health", undefined)).toBe(true);
  });
});

describe("filterSyncPatch: HRV", () => {
  it("Garmin HRV replaces Apple Health SDNN", () => {
    const out = filterSyncPatch({ hrvMs: 52 }, existing({ sources: { hrv: "apple_health" } }), "garmin");
    expect(out).toEqual({ hrvMs: 52 });
  });

  it("Apple Health can't replace Garmin or Whoop HRV", () => {
    expect(filterSyncPatch({ hrvMs: 40 }, existing({ sources: { hrv: "garmin" } }), "apple_health")).toEqual({});
    expect(filterSyncPatch({ hrvMs: 40 }, existing({ sources: { hrv: "whoop" } }), "apple_health")).toEqual({});
  });

  it("Whoop fills HRV when Apple Health had it (the old order was the other way)", () => {
    expect(filterSyncPatch({ hrvMs: 60 }, existing({ sources: { hrv: "apple_health" } }), "whoop")).toEqual({
      hrvMs: 60,
    });
  });

  it("Apple Health still fills HRV on a day no wearable reported", () => {
    expect(filterSyncPatch({ hrvMs: 40, restingHr: 55 }, existing(), "apple_health")).toEqual({
      hrvMs: 40,
      restingHr: 55,
    });
  });
});

describe("filterSyncPatch: sleep and resting HR", () => {
  it("Garmin sleep beats the Apple Health copy of it", () => {
    const ex = existing({ sources: { sleep: "apple_health", rhr: "apple_health" }, sleepDetailSource: "apple_health" });
    expect(filterSyncPatch({ sleepMin: 420, restingHr: 50, sleepDetail: {} }, ex, "garmin")).toEqual({
      sleepMin: 420,
      restingHr: 50,
      sleepDetail: {},
    });
  });

  it("the Apple Health copy doesn't undo Garmin", () => {
    const ex = existing({ sources: { sleep: "garmin", rhr: "garmin" }, sleepDetailSource: "garmin" });
    expect(filterSyncPatch({ sleepMin: 410, restingHr: 51, sleepDetail: {} }, ex, "apple_health")).toEqual({});
  });

  it("a typed sleep value wins, but device detail still flows", () => {
    const ex = existing({ sources: { sleep: "manual" }, sleepDetailSource: "apple_health" });
    expect(filterSyncPatch({ sleepMin: 400, sleepDetail: {} }, ex, "garmin")).toEqual({ sleepDetail: {} });
  });
});

describe("filterSyncPatch: protein and water", () => {
  it("a sync may raise a human value but not lower it", () => {
    const ex = existing({ sources: { protein: "manual", water: "manual" }, proteinG: 100, waterMl: 2000 });
    expect(filterSyncPatch({ proteinG: 120, waterMl: 1500 }, ex, "apple_health")).toEqual({ proteinG: 120 });
  });
});

describe("hrvMethod", () => {
  it("names what each source measures", () => {
    expect(hrvMethod("garmin")).toBe("rmssd");
    expect(hrvMethod("whoop")).toBe("rmssd");
    expect(hrvMethod("apple_health")).toBe("sdnn");
    expect(hrvMethod("manual")).toBeNull();
    expect(hrvMethod(undefined)).toBeNull();
  });
});
