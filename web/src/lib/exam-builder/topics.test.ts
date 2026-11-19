import { describe, expect, it } from "vitest";
import { groupTopics, topicPath } from "./topics";
import type { Topic } from "./types";

// Deliberately out of order: the tree must come from `position`, not row order.
const ROWS: Topic[] = [
  { id: "sifaat.ra", parent_id: "sifaat", title: "Ra", position: 43 },
  { id: "seerah", parent_id: null, title: "Seerah", position: 90 },
  { id: "sifaat", parent_id: null, title: "Sifaat", position: 40 },
  { id: "noon.iqlaab", parent_id: "noon", title: "Iqlaab", position: 24 },
  { id: "sifaat.heavy", parent_id: "sifaat", title: "Heavy letters", position: 41 },
  { id: "noon", parent_id: null, title: "Aḥkām Nūn Sākin & Tanwīn", position: 20 },
  { id: "noon.ghunna", parent_id: "noon", title: "Ghunna", position: 21 },
];

describe("groupTopics", () => {
  it("orders parents by position and nests their children in position order", () => {
    const groups = groupTopics(ROWS);
    expect(groups.map((g) => g.topic.id)).toEqual(["noon", "sifaat", "seerah"]);
    expect(groups[0].children.map((c) => c.id)).toEqual(["noon.ghunna", "noon.iqlaab"]);
    expect(groups[1].children.map((c) => c.id)).toEqual(["sifaat.heavy", "sifaat.ra"]);
  });

  it("keeps a standalone subject as its own leaf, with no children", () => {
    const seerah = groupTopics(ROWS).find((g) => g.topic.id === "seerah");
    expect(seerah?.children).toEqual([]);
  });

  it("does not lose a child whose parent is missing; it stands on its own", () => {
    const groups = groupTopics([...ROWS, { id: "waqf.x", parent_id: "waqf", title: "Orphan", position: 61 }]);
    expect(groups.map((g) => g.topic.id)).toContain("waqf.x");
  });

  it("returns nothing for no rows", () => {
    expect(groupTopics([])).toEqual([]);
  });
});

describe("topicPath", () => {
  it("joins parent and child with a chevron", () => {
    expect(topicPath("sifaat.ra", ROWS)).toBe("Sifaat › Ra");
  });

  it("is just the title for a top-level topic", () => {
    expect(topicPath("seerah", ROWS)).toBe("Seerah");
  });

  it("falls back to the raw id for an unknown topic", () => {
    expect(topicPath("nope", ROWS)).toBe("nope");
  });
});
