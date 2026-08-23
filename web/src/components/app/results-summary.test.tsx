// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ResultsSummary, type SummaryRow } from "./results-summary";

afterEach(cleanup);

const row = (over: Partial<SummaryRow> & { studentId: string; name: string }): SummaryRow => ({
  href: `/teacher/curriculum/1?tab=individual&student=${over.studentId}`,
  state: "approved",
  marks: 8,
  pct: 80,
  late: false,
  ...over,
});

const render1 = (
  rows: SummaryRow[],
  hardest: Parameters<typeof ResultsSummary>[0]["hardest"] = [],
  mostMissed: Parameters<typeof ResultsSummary>[0]["mostMissed"] = null,
) =>
  render(
    <ResultsSummary
      rows={rows}
      totalMarks={10}
      hardest={hardest}
      mostMissed={mostMissed}
      questionHref="/teacher/curriculum/1?tab=question"
    />,
  );

describe("ResultsSummary", () => {
  it("reports the class average, median and range", () => {
    const { container } = render1([
      row({ studentId: "a", name: "Aisha", marks: 10, pct: 100 }),
      row({ studentId: "b", name: "Bilal", marks: 6, pct: 60 }),
      row({ studentId: "c", name: "Zayd", marks: 5, pct: 50 }),
    ]);
    expect(container.textContent).toContain("70%"); // mean
    expect(container.textContent).toContain("60%"); // median
    expect(container.textContent).toContain("50–100");
  });

  it("counts a missing student in the denominator but not the average", () => {
    const { container } = render1([
      row({ studentId: "a", name: "Aisha", marks: 10, pct: 100 }),
      row({ studentId: "b", name: "Bilal", state: "missing", marks: null, pct: null }),
    ]);
    expect(container.textContent).toContain("of 2");
    expect(container.textContent).toContain("100%");
    expect(container.textContent).toContain("not submitted");
  });

  it("says how many marks are the model's and not yet approved", () => {
    const { container } = render1([
      row({ studentId: "a", name: "Aisha", state: "provisional" }),
      row({ studentId: "b", name: "Bilal", state: "waiting", marks: null, pct: null }),
    ]);
    expect(container.textContent).toContain("not yet approved");
    expect(container.textContent).toContain("not marked at all");
  });

  it("shows nothing to average before anything is marked", () => {
    const { container } = render1([
      row({ studentId: "a", name: "Aisha", state: "waiting", marks: null, pct: null }),
    ]);
    // StatTile's empty dash, never a class average of 0%
    expect(container.textContent).toContain("Class average—");
    // and no distribution of nothing
    expect(container.textContent).not.toContain("Spread");
  });

  it("links a student's row to their own script, and leaves a missing one dead", () => {
    const { getByText, container } = render1([
      row({ studentId: "a", name: "Aisha" }),
      row({ studentId: "b", name: "Bilal", state: "missing", marks: null, pct: null }),
    ]);
    expect(getByText("Aisha").closest("a")?.getAttribute("href")).toContain("student=a");
    expect(getByText("Bilal").closest("a")).toBeNull();
    expect(container.textContent).toContain("8/10");
  });

  it("heads the hardest questions with their position on the paper", () => {
    const { container, getByText } = render1(
      [row({ studentId: "a", name: "Aisha" })],
      [{ n: 3, prompt: "Define tarteel", pctOfMax: 42, points: 4 }],
    );
    expect(container.textContent).toContain("Q3");
    expect(container.textContent).toContain("42%");
    expect(getByText("Define tarteel").closest("a")?.getAttribute("href")).toContain("tab=question");
  });

  it("names the question the most students got wrong, and its headcount", () => {
    const { container, getByText } = render1([row({ studentId: "a", name: "Aisha" })], [], {
      n: 5,
      prompt: "Name three masaa'il",
      dropped: 5,
      marked: 6,
      blank: 2,
      pctOfMax: 30,
      points: 3,
    });
    expect(container.textContent).toContain("Most missed · Q5");
    expect(container.textContent).toContain("5 of 6 marked scripts dropped a mark here");
    expect(container.textContent).toContain("and 2 left it blank");
    expect(getByText("Name three masaa'il").closest("a")?.getAttribute("href")).toContain(
      "tab=question",
    );
  });

  it("says nothing about blanks when there were none", () => {
    const { container } = render1([row({ studentId: "a", name: "Aisha" })], [], {
      n: 2,
      prompt: "Define tarteel",
      dropped: 3,
      marked: 3,
      blank: 0,
      pctOfMax: 40,
      points: 2,
    });
    expect(container.textContent).toContain("dropped a mark here \u2014 worth");
    expect(container.textContent).not.toContain("leaving it blank");
  });

  it("heads no section at all when nothing is marked and nothing was missed", () => {
    const { container } = render1([row({ studentId: "a", name: "Aisha" })]);
    expect(container.textContent).not.toContain("Where the marks went");
    expect(container.textContent).not.toContain("Most missed");
  });

  it("marks a late hand-in", () => {
    const { container } = render1([row({ studentId: "a", name: "Aisha", late: true })]);
    expect(container.textContent).toContain("late");
  });
});
