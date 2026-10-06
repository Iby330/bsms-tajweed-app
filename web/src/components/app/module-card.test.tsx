// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { ModuleCard } from "./module-card";
import type { Module } from "@/lib/curriculum/tree";

afterEach(cleanup);

const lesson = (id: string, youtubeId: string | null) => ({
  id,
  week_id: "w1",
  series: "tajweed",
  title: "Tajweed 3 — Iqlaab",
  youtube_id: youtubeId,
  position: 1,
});

const homework = (number: number, series: string) => ({
  id: "h1",
  week_id: "w1",
  number,
  series,
  title: "Homework",
  total_marks: 19,
  due_at: null,
  is_graded: true,
});

const wk = (over: Partial<Module> = {}): Module => ({
  weekId: "w1",
  weekNumber: 1,
  unlockAt: "2026-10-03T00:00:00Z",
  unlocked: true,
  title: "The Qur'an, Tajweed and the Letters",
  lessons: [],
  homework: null,
  watched: false,
  submission: null,
  redo: null,
  actionable: true,
  done: false,
  ...over,
});

/** Whatever link carries the ::before overlay is the one the whole card opens. */
const cardLink = (container: HTMLElement) =>
  [...container.querySelectorAll("a")].find((a) => a.className.includes("before:inset-0"));

describe("ModuleCard", () => {
  it("opens the lesson from anywhere on a card with a video, and lifts the homework link above it", () => {
    const { container } = render(
      <ModuleCard module={wk({ lessons: [lesson("l1", "abcdefghijk")], homework: homework(3, "tajweed") })} series="tajweed" />,
    );
    expect(cardLink(container)?.getAttribute("href")).toBe("/lessons/l1");
    const hw = container.querySelector('a[href^="/homework/3"]')!;
    expect(hw.className).toContain("z-10");
  });

  it("opens the homework from anywhere on a week that is only a homework (Qāʿidah)", () => {
    const { container } = render(
      <ModuleCard module={wk({ homework: homework(301, "qaidah") })} series="qaidah" courseLabel="Qāʿidah Nūrāniyyah" />,
    );
    expect(cardLink(container)?.getAttribute("href")).toBe("/homework/301?from=course");
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(screen.getByText("Qāʿidah 1")).toBeTruthy();
  });

  it("shows the course's cover on a homework-only week, not a promise of video", () => {
    const { container } = render(
      <ModuleCard module={wk({ homework: homework(301, "qaidah") })} series="qaidah" courseLabel="Qāʿidah Nūrāniyyah" />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/courses/qaidah.png");
    expect(screen.queryByText(/video coming soon/)).toBeNull();
  });

  it("says the week is a homework when the course has no cover", () => {
    render(<ModuleCard module={wk({ homework: homework(401, "seerah") })} series="seerah" courseLabel="Seerah" />);
    expect(screen.getByText("Seerah · homework")).toBeTruthy();
    expect(screen.queryByText(/video coming soon/)).toBeNull();
  });

  it("still promises the video on a lesson whose video is not up yet", () => {
    render(<ModuleCard module={wk({ lessons: [lesson("l1", null)], homework: homework(3, "tajweed") })} series="tajweed" />);
    expect(screen.getByText("Tajweed · video coming soon")).toBeTruthy();
  });

  it("opens nothing on a locked week", () => {
    const { container } = render(
      <ModuleCard module={wk({ unlocked: false, homework: homework(301, "qaidah") })} series="qaidah" />,
    );
    expect(container.querySelector("a")).toBeNull();
  });
});
