import { describe, expect, it } from "vitest";
import { canOpenSection, scopedHref, type HomeworkScope } from "./scope";

const cls = (id: string, name: string) => ({ id, name, section: "sisters" });

const scope = (over: Partial<HomeworkScope> = {}): HomeworkScope => ({
  classes: [cls("hareer", "Hareer"), cls("rayyan", "Rayyan")],
  selected: cls("hareer", "Hareer"),
  students: [],
  label: "Hareer",
  own: "hareer",
  ...over,
});

/** Every link out of a homework screen has to keep the class being marked. */
describe("scopedHref", () => {
  it("leaves the teacher's own class out of the URL", () => {
    expect(scopedHref(scope(), "/teacher/homework/5")).toBe("/teacher/homework/5");
  });

  it("carries a colleague's class", () => {
    const s = scope({ selected: cls("rayyan", "Rayyan"), label: "Rayyan" });
    expect(scopedHref(s, "/teacher/homework/5")).toBe("/teacher/homework/5?class=rayyan");
  });

  it("carries the section-wide view as `all`", () => {
    expect(scopedHref(scope({ selected: null }), "/teacher/homework/5")).toBe(
      "/teacher/homework/5?class=all",
    );
  });

  it("appends to a href that already has a query string", () => {
    const s = scope({ selected: cls("rayyan", "Rayyan") });
    expect(scopedHref(s, "/teacher/curriculum/5?tab=question")).toBe(
      "/teacher/curriculum/5?tab=question&class=rayyan",
    );
  });

  it("adds nothing for a teacher with no class of their own on their own view", () => {
    // own is null and a class is selected — the param has to travel, or the
    // next page would open on the section instead of the class being marked
    const s = scope({ own: null });
    expect(scopedHref(s, "/teacher/homework")).toBe("/teacher/homework?class=hareer");
  });
});

/** The section is the boundary: every class is listed, only your own open. */
describe("canOpenSection", () => {
  it("opens a class in the teacher's own section", () => {
    expect(canOpenSection("brothers", "brothers")).toBe(true);
    expect(canOpenSection("sisters", "sisters")).toBe(true);
    expect(canOpenSection("demo", "demo")).toBe(true);
  });

  it("refuses the other cohort, both ways round", () => {
    expect(canOpenSection("brothers", "sisters")).toBe(false);
    expect(canOpenSection("sisters", "brothers")).toBe(false);
  });

  it("keeps the demo cohort out of the real classes, and vice versa", () => {
    expect(canOpenSection("demo", "brothers")).toBe(false);
    expect(canOpenSection("demo", "sisters")).toBe(false);
    expect(canOpenSection("brothers", "demo")).toBe(false);
  });

  // A missing section is an account mid-setup, not a wildcard — refusing is
  // the safe read, and the page it guards 404s rather than showing a roster.
  it("refuses when either section is missing", () => {
    expect(canOpenSection(null, "brothers")).toBe(false);
    expect(canOpenSection(undefined, "brothers")).toBe(false);
    expect(canOpenSection("brothers", null)).toBe(false);
    expect(canOpenSection("brothers", undefined)).toBe(false);
    expect(canOpenSection(null, null)).toBe(false);
  });

  it("does not treat two empty strings as a match", () => {
    expect(canOpenSection("", "")).toBe(false);
  });
});
