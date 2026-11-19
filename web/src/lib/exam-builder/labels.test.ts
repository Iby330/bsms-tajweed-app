import { describe, expect, it } from "vitest";
import { DEFAULT_NOTES, DEFAULT_SECTIONS, suggestSection, usedLabel } from "./labels";

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

describe("suggestSection", () => {
  const S = [
    { id: "c", title: "Section C - Practical Component", kind: "practical" as const, position: 3 },
    { id: "b", title: "Section B - Short Answer Questions", kind: "questions" as const, position: 2 },
    { id: "a", title: "Section A - Multiple Choice Questions", kind: "questions" as const, position: 1 },
  ];

  it("puts a multiple choice question in the multiple choice section", () => {
    expect(suggestSection("mcq", S)?.id).toBe("a");
  });

  it("puts a short answer question in the short answer section", () => {
    expect(suggestSection("short", S)?.id).toBe("b");
  });

  it("falls back to the first question section by position when no title matches", () => {
    const renamed = [
      { id: "z", title: "Part 2", kind: "questions" as const, position: 2 },
      { id: "p", title: "Practical", kind: "practical" as const, position: 0 },
      { id: "y", title: "Part 1", kind: "questions" as const, position: 1 },
    ];
    expect(suggestSection("mcq", renamed)?.id).toBe("y");
  });

  it("never suggests a practical section, even if its title matches", () => {
    const odd = [{ id: "p", title: "Short answer practical", kind: "practical" as const, position: 1 }];
    expect(suggestSection("short", odd)).toBeNull();
  });

  it("is null when the paper has no question section", () => {
    expect(suggestSection("mcq", [])).toBeNull();
  });
});
