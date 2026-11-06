import { describe, expect, it } from "vitest";
import { localHour, localToUtc, tzOffsetMin } from "./dates";

describe("localToUtc", () => {
  it("handles Dubai and Bengaluru (half-hour offset)", () => {
    expect(localToUtc("2024-06-28", "21:20", "Asia/Dubai").toISOString()).toBe("2024-06-28T17:20:00.000Z");
    expect(localToUtc("2024-06-28", "08:00", "Asia/Kolkata").toISOString()).toBe("2024-06-28T02:30:00.000Z");
    expect(tzOffsetMin(new Date("2024-06-28T00:00:00Z"), "Asia/Kolkata")).toBe(330);
  });
  it("handles DST zones", () => {
    expect(localToUtc("2026-07-01", "12:00", "Europe/London").toISOString()).toBe("2026-07-01T11:00:00.000Z");
    expect(localToUtc("2026-01-01", "12:00", "Europe/London").toISOString()).toBe("2026-01-01T12:00:00.000Z");
  });
});

describe("localHour", () => {
  it("reads the wall-clock hour in a timezone, midnight as 0", () => {
    const d = new Date("2026-11-06T04:30:00Z");
    expect(localHour(d, "Asia/Kolkata")).toBe(10);
    expect(localHour(d, "Asia/Dubai")).toBe(8);
    expect(localHour(d, "America/New_York")).toBe(23);
    expect(localHour(new Date("2026-11-06T18:30:00Z"), "Asia/Kolkata")).toBe(0);
  });
});
