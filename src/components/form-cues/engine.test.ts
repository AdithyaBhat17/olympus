import { describe, expect, it } from "vitest";
import { monotoneCubic } from "./engine";

describe("monotoneCubic keyframes", () => {
  const BAR = [[0, 0.225], [0.14, 0.225], [0.44, 0.865], [0.58, 0.865], [0.92, 0.225], [1, 0.225]];

  it("passes through every key", () => {
    for (const [t, v] of BAR) expect(monotoneCubic(BAR, t)).toBeCloseTo(v, 9);
  });

  it("holds stay perfectly still", () => {
    for (let t = 0; t <= 0.14; t += 0.01) expect(monotoneCubic(BAR, t)).toBe(0.225);
    for (let t = 0.44; t <= 0.58; t += 0.01) expect(monotoneCubic(BAR, t)).toBeCloseTo(0.865, 9);
  });

  it("never overshoots the keys", () => {
    for (let t = 0; t <= 1; t += 0.001) {
      const v = monotoneCubic(BAR, t);
      expect(v).toBeGreaterThanOrEqual(0.225 - 1e-9);
      expect(v).toBeLessThanOrEqual(0.865 + 1e-9);
    }
  });

  it("is monotone between rising keys", () => {
    let prev = -Infinity;
    for (let t = 0.14; t <= 0.44; t += 0.005) {
      const v = monotoneCubic(BAR, t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
  });
});
