import { describe, expect, it } from "vitest";
import {
  ALL_RULES, START, drawerLevel, guessSectionKind, kindWord, nextRule, placeTopicIds, sectionLetter,
  sectionShortName, stepUp,
} from "./drawer";
import { groupTopics } from "./topics";
import type { Topic } from "./types";

const qs = (title: string) => ({ title, kind: "questions" as const });

describe("guessSectionKind", () => {
  it("follows the questions already in the section", () => {
    expect(guessSectionKind(qs("Anything"), [{ kind: "mcq" }, { kind: "mcq" }])).toBe("mcq");
    expect(guessSectionKind(qs("Section A - Multiple Choice"), [{ kind: "short" }])).toBe("short");
  });

  it("shows every type when the questions are mixed", () => {
    expect(guessSectionKind(qs("Section A - Multiple Choice"), [{ kind: "mcq" }, { kind: "short" }])).toBeNull();
  });

  it("goes by the title when the section is empty", () => {
    expect(guessSectionKind(qs("Section A - Multiple Choice Questions"), [])).toBe("mcq");
    expect(guessSectionKind(qs("Section B - Short Answer Questions"), [])).toBe("short");
    expect(guessSectionKind(qs("MCQs on Sifaat"), [])).toBe("mcq");
    expect(guessSectionKind(qs("Short-answer"), [])).toBe("short");
  });

  it("shows every type when nothing tells", () => {
    expect(guessSectionKind(qs("Section D"), [])).toBeNull();
    expect(guessSectionKind(qs("Multiple choice and short answer"), [])).toBeNull();
    expect(guessSectionKind({ title: "Multiple choice", kind: "practical" }, [])).toBeNull();
  });

  it("words the type for sentences", () => {
    expect(kindWord("mcq")).toBe("multiple choice");
    expect(kindWord("short")).toBe("short answer");
    expect(kindWord(null)).toBe("questions");
  });
});

const t = (id: string, parent_id: string | null, position: number): Topic => ({ id, parent_id, title: id, position });
const groups = groupTopics([
  t("sifaat", null, 40), t("sifaat.heavy", "sifaat", 41), t("sifaat.laam", "sifaat", 42),
  t("sifaat.ra", "sifaat", 43), t("sifaat.qalqala", "sifaat", 44), t("seerah", null, 90),
]);

describe("drawer steps", () => {
  it("knows the step from the place", () => {
    expect(drawerLevel(START, groups)).toBe("series");
    expect(drawerLevel({ series: "sifaat", rule: null }, groups)).toBe("rules");
    expect(drawerLevel({ series: "sifaat", rule: "sifaat.ra" }, groups)).toBe("questions");
    expect(drawerLevel({ series: "sifaat", rule: ALL_RULES }, groups)).toBe("questions");
    expect(drawerLevel({ series: "sifaat", rule: "gone" }, groups)).toBe("rules");
    expect(drawerLevel({ series: "gone", rule: null }, groups)).toBe("series");
  });

  it("goes straight from a one-level series to its questions", () => {
    expect(drawerLevel({ series: "seerah", rule: null }, groups)).toBe("questions");
    expect(placeTopicIds({ series: "seerah", rule: null }, groups)).toEqual(["seerah"]);
    expect(stepUp({ series: "seerah", rule: null }, groups)).toEqual(START);
  });

  it("lists a rule, or the whole series", () => {
    expect(placeTopicIds({ series: "sifaat", rule: "sifaat.ra" }, groups)).toEqual(["sifaat.ra"]);
    expect(placeTopicIds({ series: "sifaat", rule: ALL_RULES }, groups)).toEqual(["sifaat"]);
    expect(placeTopicIds(START, groups)).toEqual([]);
  });

  it("steps back up one level at a time, then leaves", () => {
    expect(stepUp({ series: "sifaat", rule: "sifaat.ra" }, groups)).toEqual({ series: "sifaat", rule: null });
    expect(stepUp({ series: "sifaat", rule: null }, groups)).toEqual(START);
    expect(stepUp(START, groups)).toBeNull();
  });

  it("moves to the next rule that has questions", () => {
    const counts = { "sifaat.heavy": 3, "sifaat.laam": 0, "sifaat.ra": 2 };
    expect(nextRule({ series: "sifaat", rule: "sifaat.heavy" }, groups, counts)).toBe("sifaat.ra");
    expect(nextRule({ series: "sifaat", rule: "sifaat.ra" }, groups, counts)).toBeNull();
    expect(nextRule({ series: "sifaat", rule: ALL_RULES }, groups, counts)).toBeNull();
    expect(nextRule({ series: "seerah", rule: null }, groups, counts)).toBeNull();
  });
});

describe("section names", () => {
  it("takes the letter from the title, else from the place", () => {
    expect(sectionLetter("Section C - Practical Component", 0)).toBe("C");
    expect(sectionLetter("section b: short", 0)).toBe("B");
    expect(sectionLetter("Tajweed rules", 1)).toBe("B");
    expect(sectionLetter("Sections of the Quran", 0)).toBe("A");
  });

  it("shortens the title for a button", () => {
    expect(sectionShortName("Section A - Multiple Choice Questions")).toBe("Section A");
    expect(sectionShortName("Tajweed rules")).toBe("this section");
  });
});
