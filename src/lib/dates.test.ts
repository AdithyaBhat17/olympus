import { describe, expect, it } from "vitest";
import { localToUtc, tzOffsetMin } from "./dates";

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
