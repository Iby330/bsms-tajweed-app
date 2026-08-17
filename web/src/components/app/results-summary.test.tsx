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

const render1 = (rows: SummaryRow[], hardest: Parameters<typeof ResultsSummary>[0]["hardest"] = []) =>
  render(
    <ResultsSummary
      rows={rows}
      totalMarks={10}
      hardest={hardest}
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
    expect(container.textContent).toContain("of 2 students");
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

  it("marks a late hand-in", () => {
    const { container } = render1([row({ studentId: "a", name: "Aisha", late: true })]);
    expect(container.textContent).toContain("late");
  });
});
