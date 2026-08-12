// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ProgressRing } from "./progress-ring";

describe("ProgressRing", () => {
  it("draws a track and an arc when there is a value", () => {
    const { container } = render(<ProgressRing value={75} />);
    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });

  it("draws only the empty track when there is nothing marked", () => {
    const { container } = render(<ProgressRing value={null} />);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("tells a screen reader the figure, not the geometry", () => {
    const { container } = render(<ProgressRing value={75.4} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-label")).toBe("75% complete");
  });

  it("says plainly when there is no figure yet", () => {
    const { container } = render(<ProgressRing value={null} />);
    expect(container.querySelector("svg")!.getAttribute("aria-label")).toBe("No marks yet");
  });

  it("renders its centre content", () => {
    const { container } = render(<ProgressRing value={60}><b>60%</b></ProgressRing>);
    expect(container.textContent).toContain("60%");
  });

  it("never emits NaN into the DOM for an odd value", () => {
    const { container } = render(<ProgressRing value={Number.NaN} />);
    expect(container.innerHTML).not.toContain("NaN");
  });
});
