import { describe, expect, it } from "vitest";
import { DEFAULT_NOTES, DEFAULT_SECTIONS, usedLabel } from "./labels";

describe("usedLabel", () => {
  it("is the code and the season, as the database stamps it", () => {
    expect(usedLabel("EOT1", "26/27")).toBe("EOT1 26/27");
    expect(usedLabel(" EOY ", " 25/26 ")).toBe("EOY 25/26");
  });
});

describe("DEFAULT_SECTIONS", () => {
  it("is last year's A, B and the practical C", () => {
    expect(DEFAULT_SECTIONS.map((s) => s.title)).toEqual([
      "Section A - Multiple Choice Questions",
      "Section B - Short Answer Questions",
      "Section C - Practical Component",
    ]);
    expect(DEFAULT_SECTIONS.map((s) => s.kind)).toEqual(["questions", "questions", "practical"]);
    expect(DEFAULT_SECTIONS[2].practical).toEqual({
      rows: 3, marks: 9, columns: ["Verse", "Surah", "Order - before/after"],
    });
    expect(DEFAULT_SECTIONS[0].practical).toBeNull();
  });
});

describe("DEFAULT_NOTES", () => {
  it("is last year's three note lines, word for word", () => {
    expect(DEFAULT_NOTES).toEqual([
      "Section A is made up of Multiple choice questions. Read carefully and select all correct answers, ensuring all examples you give are from the Qur'an.",
      "Section B consists of short answer questions.",
      "Section C is the practical component and comprises a hifdh test.",
    ]);
  });
});
