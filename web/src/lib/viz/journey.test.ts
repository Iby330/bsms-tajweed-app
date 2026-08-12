import { describe, it, expect } from "vitest";
import { journeyNodes } from "./journey";

describe("journeyNodes", () => {
  it("returns nothing to draw for an empty target", () => {
    expect(journeyNodes(0, 300, 60)).toEqual([]);
    expect(journeyNodes(-3, 300, 60)).toEqual([]);
  });

  it("returns one node per surah", () => {
    // 43 is the real target: An-Nas down to Al-Jinn.
    expect(journeyNodes(43, 300, 60)).toHaveLength(43);
  });

  it("walks left to right, never backwards", () => {
    const nodes = journeyNodes(12, 300, 60);
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i].x).toBeGreaterThan(nodes[i - 1].x);
    }
  });

  it("keeps every node inside the drawing box", () => {
    for (const n of journeyNodes(20, 300, 60)) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(300);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(60);
    }
  });

  it("places a lone node at the start rather than dividing by zero", () => {
    const [only] = journeyNodes(1, 300, 60);
    expect(Number.isNaN(only.x)).toBe(false);
    expect(Number.isNaN(only.y)).toBe(false);
  });
});
