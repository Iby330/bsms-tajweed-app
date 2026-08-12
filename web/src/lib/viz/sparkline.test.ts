import { describe, it, expect } from "vitest";
import { sparklinePoints, trendOf } from "./sparkline";

const ys = (points: string) => points.split(" ").map((p) => Number(p.split(",")[1]));
const xs = (points: string) => points.split(" ").map((p) => Number(p.split(",")[0]));

describe("sparklinePoints", () => {
  it("refuses to draw a line through fewer than two marks", () => {
    expect(sparklinePoints([], 100, 20)).toBe("");
    expect(sparklinePoints([72], 100, 20)).toBe("");
  });

  it("emits one point per mark, spread across the full width", () => {
    const p = sparklinePoints([60, 70, 80], 100, 20);
    expect(p.split(" ")).toHaveLength(3);
    expect(xs(p)[0]).toBe(0);
    expect(xs(p)[2]).toBe(100);
  });

  it("puts a flat run on the midline instead of dividing by zero", () => {
    const p = sparklinePoints([75, 75, 75], 100, 20);
    expect(ys(p)).toEqual([10, 10, 10]);
    expect(p).not.toContain("NaN");
  });

  it("draws improvement as a rising line (smaller y is higher in SVG)", () => {
    const p = sparklinePoints([50, 90], 100, 20);
    expect(ys(p)[1]).toBeLessThan(ys(p)[0]);
  });

  it("keeps every point inside the box", () => {
    const p = sparklinePoints([10, 99, 40, 88], 120, 30);
    for (const y of ys(p)) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(30);
    }
  });
});

describe("trendOf", () => {
  it("calls a rise up and a fall down", () => {
    expect(trendOf([60, 80])).toBe("up");
    expect(trendOf([80, 60])).toBe("down");
  });

  it("calls a negligible change flat, so noise is not reported as progress", () => {
    expect(trendOf([75, 75.2])).toBe("flat");
    expect(trendOf([75])).toBe("flat");
    expect(trendOf([])).toBe("flat");
  });
});
