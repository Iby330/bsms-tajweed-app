// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HifzArc } from "./hifz-arc";

describe("HifzArc", () => {
  it("draws a node per surah in the target", () => {
    const { container } = render(<HifzArc passed={5} expected={4} target={12} />);
    expect(container.querySelectorAll("[data-node]")).toHaveLength(12);
  });

  it("marks exactly the passed surahs as done", () => {
    const { container } = render(<HifzArc passed={5} expected={4} target={12} />);
    expect(container.querySelectorAll('[data-node="done"]')).toHaveLength(5);
  });

  it("says the student is ahead when they are past the expectation", () => {
    const { container } = render(<HifzArc passed={6} expected={4} target={12} />);
    expect(container.textContent).toContain("ahead of pace");
    expect(container.textContent).toContain("6");
    expect(container.textContent).toContain("12");
  });

  it("says on pace and behind pace for the other two cases", () => {
    const { container: onPace } = render(<HifzArc passed={4} expected={4} target={12} />);
    expect(onPace.textContent).toContain("on pace");
    const { container: behind } = render(<HifzArc passed={2} expected={4} target={12} />);
    expect(behind.textContent).toContain("behind pace");
  });

  it("draws the pace marker where the expectation sits", () => {
    const { container } = render(<HifzArc passed={2} expected={4} target={12} />);
    expect(container.querySelectorAll("[data-pace]")).toHaveLength(1);
  });

  it("omits the pace marker before the year has an expectation", () => {
    const { container } = render(<HifzArc passed={0} expected={0} target={12} />);
    expect(container.querySelectorAll("[data-pace]")).toHaveLength(0);
  });

  it("renders nothing at all when no target has been set", () => {
    const { container } = render(<HifzArc passed={0} expected={0} target={0} />);
    expect(container.querySelectorAll("[data-node]")).toHaveLength(0);
  });
});
