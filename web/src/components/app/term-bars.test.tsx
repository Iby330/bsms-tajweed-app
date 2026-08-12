// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TermBars } from "./term-bars";
import type { TermProgress } from "@/lib/dashboard/queries";

const terms: TermProgress[] = [
  { termId: 1, examMax: 50, examScore: 40, hwAvg: 90, termPct: 82 },
  { termId: 2, examMax: 50, examScore: 35, hwAvg: 80, termPct: 72 },
  { termId: 3, examMax: 50, examScore: null, hwAvg: 75, termPct: null },
];

describe("TermBars", () => {
  it("draws a bar per term", () => {
    const { container } = render(<TermBars terms={terms} currentTermId={3} />);
    expect(container.querySelectorAll("[data-term]")).toHaveLength(3);
  });

  it("labels a finished term with its mark", () => {
    const { container } = render(<TermBars terms={terms} currentTermId={3} />);
    expect(container.textContent).toContain("82.0%");
  });

  it("marks the current term as live instead of inventing a mark for it", () => {
    const { container } = render(<TermBars terms={terms} currentTermId={3} />);
    const live = container.querySelector('[data-term="3"]')!;
    expect(live.textContent).toContain("live");
    expect(live.textContent).not.toContain("%");
  });

  it("shows both contributions once the exam is sat, homework alone before", () => {
    const { container } = render(<TermBars terms={terms} currentTermId={3} />);
    expect(container.querySelectorAll('[data-term="1"] [data-part="exam"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-term="3"] [data-part="exam"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-term="3"] [data-part="homework"]')).toHaveLength(1);
  });

  it("draws an empty track for a term that has not started", () => {
    const empty: TermProgress[] = [
      { termId: 1, examMax: 50, examScore: null, hwAvg: null, termPct: null },
    ];
    const { container } = render(<TermBars terms={empty} currentTermId={1} />);
    expect(container.querySelectorAll("[data-part]")).toHaveLength(0);
    expect(container.querySelector("[data-term]")).not.toBeNull();
  });
});
