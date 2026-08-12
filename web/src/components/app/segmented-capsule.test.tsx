// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SegmentedCapsule } from "./segmented-capsule";

describe("SegmentedCapsule", () => {
  it("draws one segment per released homework", () => {
    const { container } = render(
      <SegmentedCapsule segments={["done", "done", "overdue", "pending"]} />,
    );
    expect(container.querySelectorAll("span[data-state]")).toHaveLength(4);
  });

  it("colours each segment by its state", () => {
    const { container } = render(<SegmentedCapsule segments={["done", "overdue", "pending"]} />);
    const states = [...container.querySelectorAll("span[data-state]")].map((s) =>
      s.getAttribute("data-state"),
    );
    expect(states).toEqual(["done", "overdue", "pending"]);
  });

  it("counts only what is handed in, for screen readers", () => {
    const { container } = render(
      <SegmentedCapsule segments={["done", "done", "overdue", "pending"]} />,
    );
    expect(container.querySelector('[role="img"]')!.getAttribute("aria-label")).toBe(
      "2 of 4 homeworks handed in",
    );
  });

  it("says nothing is out yet in week zero rather than drawing an empty bar", () => {
    const { container } = render(<SegmentedCapsule segments={[]} />);
    expect(container.textContent).toContain("Nothing released yet");
    expect(container.querySelectorAll("span[data-state]")).toHaveLength(0);
  });

  it("survives a single released homework", () => {
    const { container } = render(<SegmentedCapsule segments={["pending"]} />);
    expect(container.querySelectorAll("span[data-state]")).toHaveLength(1);
  });
});
