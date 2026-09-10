// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";
import { CalendarMonths, type CalendarDay } from "./calendar-months";

const lesson = (courseLabel: string, label: string, href: string | null) => ({
  courseLabel,
  label,
  href,
  missing: false,
});

const days: Record<string, CalendarDay> = {
  "2026-10-05": {
    type: "tajweed",
    holiday: null,
    events: [],
    lessons: [
      lesson("Ghunna", "Introduction", "/lessons/a"),
      lesson("Umm al-Kitāb", "The Basmala", null),
    ],
  },
  "2026-10-08": { type: "hifdh", holiday: null, events: [], lessons: [] },
  "2026-10-15": {
    type: "hifdh",
    holiday: null,
    events: [{ title: "Term 1 exam", detail: "In person." }],
    lessons: [],
  },
};

const setup = (today = "2026-10-07") =>
  render(<CalendarMonths months={["2026-10"]} days={days} today={today} />);

const cell = (iso: string) => document.querySelector<HTMLElement>(`[data-day="${iso}"]`);

afterEach(cleanup);

describe("CalendarMonths", () => {
  it("draws every day of the month, class or not", () => {
    setup();
    expect(document.querySelectorAll("[data-day]")).toHaveLength(31);
  });

  it("opens every class day, including one with no lessons behind it", () => {
    setup();
    expect(cell("2026-10-05")?.tagName).toBe("BUTTON"); // tajweed, two lessons
    expect(cell("2026-10-08")?.tagName).toBe("BUTTON"); // hifdh, none
  });

  it("leaves a day that is not a class inert", () => {
    setup();
    expect(cell("2026-10-06")?.tagName).toBe("SPAN"); // an ordinary Tuesday
  });

  it("marks today with a filled disc", () => {
    setup("2026-10-07");
    // The 7th is a Wednesday and no class, so this also proves the marker
    // does not depend on the day being taught.
    const disc = document.querySelector("[data-today]");
    expect(disc?.textContent).toContain("7");
    expect(disc?.className).toContain("bg-ink");
  });

  it("marks exactly one day as today", () => {
    setup("2026-10-05");
    expect(document.querySelectorAll("[data-today]")).toHaveLength(1);
  });

  it("marks nothing when today falls outside the month on show", () => {
    // The year opens in October; in September there is no disc to draw, and
    // the break panels pick the reader up instead.
    setup("2026-09-10");
    expect(document.querySelectorAll("[data-today]")).toHaveLength(0);
  });

  it("opens a dialog naming the day and its lessons", () => {
    setup();
    fireEvent.click(cell("2026-10-05")!);
    expect(screen.getByText("Monday 5 October")).toBeTruthy();
    expect(screen.getByText("Introduction")).toBeTruthy();
    expect(screen.getByText("The Basmala")).toBeTruthy();
  });

  it("links only the lesson that has somewhere to go", () => {
    setup();
    fireEvent.click(cell("2026-10-05")!);
    const links = Array.from(document.querySelectorAll('[data-slot="dialog-content"] a'));
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/lessons/a");
    expect(links[0].textContent).toContain("Introduction");
  });

  it("says why a lesson has no link", () => {
    setup();
    fireEvent.click(cell("2026-10-05")!);
    expect(screen.getByText("Video not up yet")).toBeTruthy();
  });

  it("opens a hifdh day onto its name, with no lessons", () => {
    setup();
    fireEvent.click(cell("2026-10-08")!);
    expect(screen.getByText("Thursday 8 October")).toBeTruthy();
    expect(screen.getByText("Hifdh class")).toBeTruthy();
    expect(document.querySelectorAll('[data-slot="dialog-content"] a')).toHaveLength(0);
  });

  it("carries an event into the day it falls on", () => {
    setup();
    fireEvent.click(cell("2026-10-15")!);
    expect(screen.getByText("Term 1 exam")).toBeTruthy();
    expect(screen.getByText("In person.")).toBeTruthy();
  });
});
