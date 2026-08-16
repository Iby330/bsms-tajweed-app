// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PatternTracker } from "./pattern-tracker";

describe("PatternTracker", () => {
  it("renders nothing when there is nothing to say", () => {
    const { container } = render(<PatternTracker patterns={[]} flags={[]} />);
    expect(container.innerHTML).toBe("");
  });
  it("shows patterns with counts and flags with session ratios", () => {
    const { container } = render(
      <PatternTracker
        patterns={[{ category: "tajweed", detail: "ikhfa", label: "Tajweed — Ikhfa",
          total: 7, recent: 4, surahs: [114, 113, 110], lastSeen: "2026-08-13T00:00:00Z" }]}
        flags={[{ flag: "weak_hifz", label: "Weak hifdh overall", count: 3, ofLast: 5 }]}
      />,
    );
    expect(container.textContent).toContain("Tajweed — Ikhfa");
    expect(container.textContent).toContain("7× · 3 surahs");
    expect(container.textContent).toContain("4 recent");
    expect(container.textContent).toContain("Weak hifdh overall");
    expect(container.textContent).toContain("3 of last 5 sessions");
  });
});
