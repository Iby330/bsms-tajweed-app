import { describe, expect, it } from "vitest";
import { TERMS, timetableFor, termSessions } from "@/lib/attendance/calendar";
import {
  CLASS_GROUP,
  COURSES,
  SYLLABUS,
  coursesForTerm,
  hasSyllabus,
  type CourseKey,
  type GroupId,
} from "./syllabus";

const GROUPS = [1, 2, 3, 4, 5, 6] as const;

describe("SYLLABUS", () => {
  it.each(GROUPS)("gives group %i a plan for all three terms", (group) => {
    for (const term of TERMS) expect(SYLLABUS[group][term.id]).toBeDefined();
  });

  it("only ever names courses that exist", () => {
    for (const group of GROUPS)
      for (const term of TERMS)
        for (const key of SYLLABUS[group][term.id])
          expect(COURSES[key as CourseKey]).toBeDefined();
  });

  it("never teaches the same course twice to one group", () => {
    for (const group of GROUPS) {
      const all = TERMS.flatMap((t) => SYLLABUS[group][t.id]);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it("follows the ranking: the top group takes mudood first", () => {
    // Group 1 does mudood in Term 1; everyone else who does it waits for
    // Term 3. This is the case the week-bound content model cannot express,
    // and the reason Course.source exists.
    expect(SYLLABUS[1][1]).toContain("mudood");
    for (const group of [2, 3, 4, 6] as GroupId[]) {
      expect(SYLLABUS[group][1]).not.toContain("mudood");
      expect(SYLLABUS[group][3]).toContain("mudood");
    }
  });
});

describe("COURSES", () => {
  it("points each course at its own lessons, never at another's", () => {
    const sources = Object.values(COURSES)
      .map((c) => c.source)
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => `${s.series} ${s.termId}`);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it("marks the two courses the app holds no content for", () => {
    const empty = Object.entries(COURSES)
      .filter(([, c]) => c.source === null)
      .map(([k]) => k)
      .sort();
    expect(empty).toEqual(["makharij", "sifaat_new"]);
  });
});

describe("CLASS_GROUP", () => {
  it("names a real group for every class listed", () => {
    for (const group of Object.values(CLASS_GROUP))
      expect(GROUPS).toContain(group);
  });

  it("gives each group at most one class per side", () => {
    const brothers = ["Masjid An-Nabawi", "Masjid Al-Haram", "Masjid Al-Umawi", "Masjid Quba", "Masjid Al-Aqsa"];
    const sisters = ["Zukhruf", "Salsabeel", "Hareer", "Rayyan"];
    for (const side of [brothers, sisters]) {
      const groups = side.map((name) => CLASS_GROUP[name]);
      expect(new Set(groups).size).toBe(groups.length);
    }
  });

  it("puts every sisters' class on a plan", () => {
    expect(CLASS_GROUP.Zukhruf).toBe(1);
    // Sajeda's Salsabeel is the basics class; Rezarta's Hareer takes the Matn (0068).
    expect(CLASS_GROUP.Salsabeel).toBe(CLASS_GROUP["Masjid Al-Aqsa"]);
    expect(coursesForTerm("Rayyan", 3)).toEqual(["mudood"]);
    expect(coursesForTerm("Hareer", 3)).toEqual(["mudood", "mabadi"]);
    for (const name of ["Hareer", "Rayyan", "Salsabeel", "Zukhruf"])
      expect(hasSyllabus(name)).toBe(true);
  });
});

describe("coursesForTerm", () => {
  it("reads a class's plan for a term", () => {
    expect(coursesForTerm("Masjid An-Nabawi", 1)).toEqual(["ghunna", "mudood", "sifaat_old"]);
    expect(coursesForTerm("Masjid Al-Haram", 2)).toEqual(["sifaat_old"]);
    expect(coursesForTerm("Masjid Quba", 3)).toEqual(["mudood", "mabadi"]);
  });

  it("is empty for a class with no syllabus, and for an unknown one", () => {
    expect(coursesForTerm("Demo: Brothers", 1)).toEqual([]);
    expect(coursesForTerm(null, 1)).toEqual([]);
    expect(coursesForTerm("Nowhere", 1)).toEqual([]);
  });

  it("hands back a copy, so a caller cannot edit the syllabus", () => {
    const first = coursesForTerm("Masjid An-Nabawi", 1);
    first.push("mabadi");
    expect(coursesForTerm("Masjid An-Nabawi", 1)).toEqual(["ghunna", "mudood", "sifaat_old"]);
  });
});

describe("how much teaching time each term actually has", () => {
  // Not a rule the code enforces — a fact worth pinning, because a course
  // with more lessons than its term has Mondays silently loses the tail.
  it("counts the brothers' tajweed Mondays per term", () => {
    const tt = timetableFor("brothers");
    // Term 2 is 5 since its start was corrected from Tuesday 5 January to
    // Monday the 4th. Ṣifāt is still 7 lessons against those 5 Mondays, so the
    // squeeze this test exists to record is smaller but not gone.
    expect(TERMS.map((t) => termSessions(t.id, tt, "tajweed").length)).toEqual([8, 5, 10]);
  });
});
