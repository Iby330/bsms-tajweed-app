import { describe, expect, it } from "vitest";
import { cohortLabels, isProgrammeSection, sectionsVisibleTo } from "./sections";

describe("isProgrammeSection", () => {
  it("is only the two real cohorts", () => {
    expect(isProgrammeSection("brothers")).toBe(true);
    expect(isProgrammeSection("sisters")).toBe(true);
    expect(isProgrammeSection("demo")).toBe(false);
    expect(isProgrammeSection("ustadhs")).toBe(false);
    expect(isProgrammeSection(null)).toBe(false);
  });
});

describe("sectionsVisibleTo", () => {
  it("keeps the ustadhs out of everyone else's lists", () => {
    expect(sectionsVisibleTo("brothers")).toEqual(["brothers", "sisters"]);
    expect(sectionsVisibleTo("sisters")).toEqual(["brothers", "sisters"]);
  });
  it("adds the ustadhs for someone in that section", () => {
    expect(sectionsVisibleTo("ustadhs")).toEqual(["ustadhs", "brothers", "sisters"]);
  });
});

describe("cohortLabels", () => {
  it("names each cohort and offers the programme board only to real ones", () => {
    expect(cohortLabels("sisters")).toEqual({ noun: "sisters", classes: "Sisters' classes", crossSection: true });
    expect(cohortLabels("brothers")).toEqual({ noun: "brothers", classes: "Brothers' classes", crossSection: true });
    expect(cohortLabels("demo")).toEqual({ noun: "demo classes", classes: "Demo classes", crossSection: false });
    expect(cohortLabels("ustadhs")).toEqual({ noun: "ustadhs", classes: "Esteemed Ustadhs", crossSection: false });
  });
});
