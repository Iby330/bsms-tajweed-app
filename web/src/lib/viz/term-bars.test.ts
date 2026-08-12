import { describe, it, expect } from "vitest";
import { termBar } from "./term-bars";
import type { TermProgress } from "@/lib/dashboard/queries";

const term = (over: Partial<TermProgress> = {}): TermProgress => ({
  termId: 1,
  examMax: 50,
  hwAvg: null,
  termPct: null,
  examScore: null,
  ...over,
});

describe("termBar", () => {
  it("splits a complete term into its 80/20 contributions", () => {
    const bar = termBar(term({ examMax: 50, examScore: 40, hwAvg: 90, termPct: 82 }));
    expect(bar.examPart).toBeCloseTo(64); // 40/50 × 80
    expect(bar.hwPart).toBeCloseTo(18); //  90%  × 20
    expect(bar.termPct).toBe(82);
  });

  it("shows homework alone while the exam is unsat, with no term mark invented", () => {
    const bar = termBar(term({ hwAvg: 75, examScore: null, termPct: null }));
    expect(bar.examPart).toBeNull();
    expect(bar.hwPart).toBeCloseTo(15);
    expect(bar.termPct).toBeNull();
  });

  it("shows an empty bar for a term that has not started", () => {
    const bar = termBar(term());
    expect(bar.examPart).toBeNull();
    expect(bar.hwPart).toBeNull();
    expect(bar.total).toBe(0);
  });

  it("totals the parts that exist", () => {
    expect(termBar(term({ examMax: 50, examScore: 50, hwAvg: 100 })).total).toBeCloseTo(100);
    expect(termBar(term({ hwAvg: 50 })).total).toBeCloseTo(10);
  });

  it("refuses to divide by a zero exam total", () => {
    const bar = termBar(term({ examMax: 0, examScore: 0, hwAvg: 60 }));
    expect(bar.examPart).toBeNull();
    expect(Number.isFinite(bar.total)).toBe(true);
  });
});
