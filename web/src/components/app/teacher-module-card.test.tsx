// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TeacherModuleCard } from "./teacher-module-card";
import type { Module } from "@/lib/curriculum/tree";

// The card is what's under test, not the paste-a-link action behind the input.
vi.mock("@/lib/lessons/actions", () => ({
  setLessonVideo: vi.fn(async () => ({ ok: true as const, youtubeId: null })),
}));

afterEach(cleanup);

const lesson = (id: string, youtubeId: string | null, title = "Tajweed 3 — Iqlaab") => ({
  id,
  week_id: "w1",
  series: "tajweed",
  title,
  youtube_id: youtubeId,
  position: 1,
});

const wk = (over: Partial<Module> = {}): Module => ({
  weekId: "w1",
  weekNumber: 3,
  unlockAt: "2026-09-12T00:00:00Z",
  unlocked: true,
  title: "Iqlaab",
  lessons: [lesson("l1", "abcdefghijk")],
  homework: null,
  watched: false,
  submission: null,
  actionable: true,
  done: false,
  ...over,
});

const homework = {
  id: "h1",
  week_id: "w1",
  number: 5,
  series: "tajweed",
  title: "Tajweed Homework 5: Iqlaab",
  total_marks: 4,
  due_at: null,
  is_graded: true,
};

describe("TeacherModuleCard", () => {
  it("opens the lesson inside the app, not YouTube", () => {
    const { container } = render(
      <TeacherModuleCard module={wk()} series="tajweed" homeworkHref={null} />,
    );
    const link = container.querySelector('a[href^="/teacher/lessons/"]');
    expect(link?.getAttribute("href")).toBe("/teacher/lessons/l1");
    // nothing leads out to YouTube, and nothing points at the student's page —
    // that one records a watch for whoever is looking
    expect(container.querySelector('a[href*="youtu"]')).toBeNull();
    expect(container.querySelector('a[href^="/lessons/"]')).toBeNull();
  });

  it("keeps the video id off the card", () => {
    const { container } = render(
      <TeacherModuleCard module={wk()} series="tajweed" homeworkHref={null} />,
    );
    expect(container.textContent).not.toContain("abcdefghijk");
    expect(container.textContent).toContain("Change");
  });

  it("still opens a lesson that has no video, so it can be added", () => {
    const { container } = render(
      <TeacherModuleCard
        module={wk({ lessons: [lesson("l1", null)] })}
        series="tajweed"
        homeworkHref={null}
      />,
    );
    expect(container.querySelector('a[href="/teacher/lessons/l1"]')).not.toBeNull();
  });

  it("shows the poster frame of the first lesson that has a video", () => {
    const { container } = render(
      <TeacherModuleCard
        module={wk({ lessons: [lesson("l1", null), lesson("l2", "second12345")] })}
        series="tajweed"
        homeworkHref={null}
      />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toContain("second12345");
  });

  it("says a week is not out yet without locking it", () => {
    const { container } = render(
      <TeacherModuleCard
        module={wk({ unlocked: false })}
        series="tajweed"
        homeworkHref="/teacher/curriculum/5"
      />,
    );
    expect(container.textContent).toContain("opens");
    // the card is still fully usable — no locked styling, video still linked
    expect(container.querySelector(".locked")).toBeNull();
    expect(container.querySelector('a[href^="/teacher/lessons/"]')).not.toBeNull();
  });

  it("links the homework to its results, with how the class is doing", () => {
    const { container, getByText } = render(
      <TeacherModuleCard
        module={wk({ homework })}
        series="tajweed"
        homeworkHref="/teacher/curriculum/5"
        homeworkNote="6 marked · 2 waiting"
      />,
    );
    expect(getByText("Homework 5").closest("a")?.getAttribute("href")).toBe(
      "/teacher/curriculum/5",
    );
    expect(container.textContent).toContain("6 marked · 2 waiting");
  });

  it("says plainly when a week carries no homework", () => {
    const { container } = render(
      <TeacherModuleCard module={wk()} series="tajweed" homeworkHref={null} />,
    );
    expect(container.textContent).toContain("No homework this week");
  });

  it("falls back to the placeholder when no video is attached", () => {
    const { container } = render(
      <TeacherModuleCard
        module={wk({ lessons: [lesson("l1", null)] })}
        series="tajweed"
        homeworkHref={null}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("video coming soon");
  });
});
