import { describe, expect, it } from "vitest";
import { formatMarks, marksLabel, numberItems, paperTotal, sectionTotal } from "./numbering";

const SECTIONS = [
  { id: "b", position: 2, kind: "questions" as const, practical: null },
  { id: "a", position: 1, kind: "questions" as const, practical: null },
  { id: "c", position: 3, kind: "practical" as const, practical: { rows: 3, marks: 9, columns: ["Verse", "Surah", "Order - before/after"] } },
];

const ITEMS = [
  { id: "a2", section_id: "a", position: 2, marks: 1 },
  { id: "b1", section_id: "b", position: 1, marks: 2 },
  { id: "a1", section_id: "a", position: 1, marks: 1.5 },
  { id: "a3", section_id: "a", position: 3, marks: 1 },
  { id: "b2", section_id: "b", position: 2, marks: 3 },
];

describe("numberItems", () => {
  it("numbers by position and restarts at 1 in each section", () => {
    expect(numberItems(SECTIONS, ITEMS)).toEqual({ a1: 1, a2: 2, a3: 3, b1: 1, b2: 2 });
  });

  it("leaves out an item whose section is not on the paper", () => {
    const n = numberItems(SECTIONS, [...ITEMS, { id: "x", section_id: "gone", position: 1, marks: 1 }]);
    expect(n.x).toBeUndefined();
  });
});

describe("sectionTotal", () => {
  it("adds the marks of the section's questions, halves included", () => {
    expect(sectionTotal(SECTIONS[1], ITEMS)).toBe(3.5);
    expect(sectionTotal(SECTIONS[0], ITEMS)).toBe(5);
  });

  it("is the table's marks for the practical section", () => {
    expect(sectionTotal(SECTIONS[2], ITEMS)).toBe(9);
  });

  it("is 0 for an empty section and for a practical with no table", () => {
    expect(sectionTotal({ id: "e", kind: "questions", practical: null }, ITEMS)).toBe(0);
    expect(sectionTotal({ id: "p", kind: "practical", practical: null }, ITEMS)).toBe(0);
  });
});

describe("paperTotal", () => {
  it("is every question section plus the practical marks", () => {
    expect(paperTotal(SECTIONS, ITEMS)).toBe(17.5);
  });

  it("ignores items in a section that is not on the paper", () => {
    expect(paperTotal(SECTIONS, [...ITEMS, { id: "x", section_id: "gone", position: 1, marks: 4 }])).toBe(17.5);
  });
});

describe("marksLabel", () => {
  it("is singular for one mark", () => {
    expect(marksLabel(1)).toBe("(1 mark)");
  });

  it("is plural otherwise, halves written with one decimal", () => {
    expect(marksLabel(2)).toBe("(2 marks)");
    expect(marksLabel(1.5)).toBe("(1.5 marks)");
    expect(marksLabel(0.5)).toBe("(0.5 marks)");
    expect(marksLabel(0)).toBe("(0 marks)");
  });
});

describe("formatMarks", () => {
  it("drops a trailing .0 and keeps a half", () => {
    expect(formatMarks(3)).toBe("3");
    expect(formatMarks(2.5)).toBe("2.5");
    expect(formatMarks(0.1 + 0.2)).toBe("0.3");
  });
});
