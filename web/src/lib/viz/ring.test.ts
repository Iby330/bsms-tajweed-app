import { describe, it, expect } from "vitest";
import { ringGeometry } from "./ring";

const R = 30;
const C = 2 * Math.PI * R;

describe("ringGeometry", () => {
  it("leaves the arc undrawn when there is no value", () => {
    const g = ringGeometry(null, R);
    expect(g.pct).toBeNull();
    expect(g.offset).toBeCloseTo(C);
  });

  it("draws nothing at 0 and the full circle at 100", () => {
    expect(ringGeometry(0, R).offset).toBeCloseTo(C);
    expect(ringGeometry(100, R).offset).toBeCloseTo(0);
  });

  it("draws half the circle at 50", () => {
    expect(ringGeometry(50, R).offset).toBeCloseTo(C / 2);
  });

  it("clamps out-of-range marks instead of overdrawing", () => {
    // A 105% mark exists in real data (bonus marks) and must not wrap the ring.
    expect(ringGeometry(140, R).offset).toBeCloseTo(0);
    expect(ringGeometry(140, R).pct).toBe(100);
    expect(ringGeometry(-5, R).offset).toBeCloseTo(C);
    expect(ringGeometry(-5, R).pct).toBe(0);
  });

  it("survives NaN rather than emitting NaN into the DOM", () => {
    const g = ringGeometry(Number.NaN, R);
    expect(g.pct).toBeNull();
    expect(Number.isNaN(g.offset)).toBe(false);
  });
});
