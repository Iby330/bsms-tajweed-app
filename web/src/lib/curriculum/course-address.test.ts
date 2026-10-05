import { describe, it, expect } from "vitest";
import { courseAddress } from "./course-address";
import type { ClassSchedule } from "./tree";

const groupOne = {
  courses: [
    { courseId: "GH", key: "ghunna", label: "Ghunna", termId: 1, position: 1 },
    { courseId: "MU", key: "mudood", label: "Mudūd", termId: 1, position: 2 },
  ],
  firstUnlockByTerm: {},
} as ClassSchedule;

describe("courseAddress", () => {
  it("points at the course by key, in the term the class takes it", () => {
    // Mudūd's rows are filed under Term 3's tajweed series; group 1 takes it in Term 1
    expect(courseAddress(groupOne, { courseId: "MU", series: "tajweed", termId: 3 }))
      .toEqual({ termId: 1, slug: "mudood", label: "Mudūd" });
  });

  it("keeps the row's own term and series without a syllabus", () => {
    expect(courseAddress(null, { courseId: "MU", series: "tajweed", termId: 3 }))
      .toEqual({ termId: 3, slug: "tajweed", label: null });
  });

  it("keeps the row's own address for a course the class does not take", () => {
    expect(courseAddress(groupOne, { courseId: "UK", series: "umm_al_kitab", termId: 1 }))
      .toEqual({ termId: 1, slug: "umm_al_kitab", label: null });
  });
});
