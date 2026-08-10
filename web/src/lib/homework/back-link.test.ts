import { describe, it, expect } from "vitest";
import { parseOrigin, homeworkNav, HOMEWORK_ORIGINS } from "./back-link";

const ctx = {
  lessonId: "lesson-1",
  termId: 3,
  series: "tajweed",
  courseLabel: "Tajweed",
};

describe("parseOrigin", () => {
  it("accepts every origin the app actually links with", () => {
    for (const o of HOMEWORK_ORIGINS) expect(parseOrigin(o)).toBe(o);
  });

  it("rejects anything else rather than trusting the URL", () => {
    // hand-edited, stale, or an array from a repeated query param
    for (const bad of ["", "Video", "elsewhere", undefined, null, 3, ["home"], {}]) {
      expect(parseOrigin(bad)).toBeNull();
    }
  });
});

describe("homeworkNav", () => {
  it("frames the video as the return journey when they came from it", () => {
    const nav = homeworkNav("video", ctx);
    expect(nav.back).toEqual({ href: "/lessons/lesson-1", label: "Back to the video" });
    // never offer the same destination twice
    expect(nav.video).toBeNull();
  });

  it("names the origin, and still offers the video, from Home", () => {
    const nav = homeworkNav("home", ctx);
    expect(nav.back).toEqual({ href: "/home", label: "Back to Home" });
    expect(nav.video).toEqual({ href: "/lessons/lesson-1", label: "Go to the video" });
  });

  it("does the same from Progress", () => {
    const nav = homeworkNav("progress", ctx);
    expect(nav.back).toEqual({ href: "/progress", label: "Back to Progress" });
    expect(nav.video?.href).toBe("/lessons/lesson-1");
  });

  it("returns to the exact course, which is term-scoped", () => {
    const nav = homeworkNav("course", ctx);
    expect(nav.back).toEqual({
      href: "/courses/3/tajweed",
      label: "Back to Tajweed",
    });
    expect(nav.video?.href).toBe("/lessons/lesson-1");
  });

  it("falls back to the breadcrumb when there is no origin", () => {
    // a bookmark or a shared link — normal, not an error
    expect(homeworkNav(null, ctx).back).toBeNull();
    expect(homeworkNav(null, ctx).video?.href).toBe("/lessons/lesson-1");
  });
});

describe("homeworkNav — degraded context", () => {
  it("offers nothing at all when a video-origin has no lesson", () => {
    // a course whose video was removed: a broken "back" is worse than none
    const nav = homeworkNav("video", { ...ctx, lessonId: null });
    expect(nav.back).toBeNull();
    expect(nav.video).toBeNull();
  });

  it("keeps the back link when the course simply has no video", () => {
    const nav = homeworkNav("progress", { ...ctx, lessonId: null });
    expect(nav.back).toEqual({ href: "/progress", label: "Back to Progress" });
    expect(nav.video).toBeNull();
  });

  it("drops a course link it cannot address, keeping the video", () => {
    for (const partial of [
      { ...ctx, termId: null },
      { ...ctx, series: null },
    ]) {
      const nav = homeworkNav("course", partial);
      expect(nav.back).toBeNull();
      expect(nav.video?.href).toBe("/lessons/lesson-1");
    }
  });

  it("names the course generically rather than printing 'undefined'", () => {
    const nav = homeworkNav("course", { ...ctx, courseLabel: null });
    expect(nav.back?.label).toBe("Back to the course");
  });

  it("never returns a link with an empty href", () => {
    for (const origin of [...HOMEWORK_ORIGINS, null]) {
      const nav = homeworkNav(origin, {});
      for (const link of [nav.back, nav.video]) {
        if (link) expect(link.href.length).toBeGreaterThan(1);
      }
    }
  });
});
