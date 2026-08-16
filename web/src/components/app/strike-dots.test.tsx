// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StrikeDots, type StrikeInfo } from "./strike-dots";

const strike = (
  reason: string,
  note: string | null = null,
  issued_at: string | null = "2026-02-11T10:00:00Z",
): StrikeInfo => ({ reason, note, issued_at });

const text = (c: HTMLElement) => c.textContent ?? "";

describe("StrikeDots", () => {
  it("always draws three slots", () => {
    const { container } = render(<StrikeDots strikes={[]} />);
    // Scoped to .slots: the panel also carries a decorative boot, which is
    // aria-hidden too and would otherwise be counted as a fourth slot.
    expect(container.querySelectorAll(".slots [aria-hidden]")).toHaveLength(3);
  });

  it("reads as clear of strikes when there are none", () => {
    const { container } = render(<StrikeDots strikes={[]} />);
    expect(text(container)).toContain("0");
    expect(text(container)).toContain("None this term");
    // no reason list when there is nothing to list
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });

  it("names what each strike was for", () => {
    const { container } = render(
      <StrikeDots strikes={[strike("homework", "HW 4 not handed in"), strike("absence")]} />,
    );
    expect(text(container)).toContain("Missed homework");
    expect(text(container)).toContain("HW 4 not handed in");
    expect(text(container)).toContain("Absence");
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("warns harder at two, since the next one ends the course", () => {
    const { container } = render(<StrikeDots strikes={[strike("absence"), strike("conduct")]} />);
    expect(text(container)).toContain("One more means leaving the course");
  });

  it("states the threshold plainly at three", () => {
    const { container } = render(
      <StrikeDots strikes={[strike("absence"), strike("conduct"), strike("homework")]} />,
    );
    expect(text(container)).toContain("Removal threshold reached");
  });

  it("caps the count at three even if more exist", () => {
    const { container } = render(
      <StrikeDots
        strikes={[strike("absence"), strike("conduct"), strike("homework"), strike("absence")]}
      />,
    );
    expect(text(container)).toContain("3");
    expect(text(container)).not.toContain("4 of 3");
    expect(container.querySelectorAll("li")).toHaveLength(3);
  });

  it("announces the count to screen readers", () => {
    const { container } = render(<StrikeDots strikes={[strike("absence")]} />);
    const img = container.querySelector('[role="img"]')!;
    expect(img.getAttribute("aria-label")).toBe("1 of 3 strikes taken this term");
  });

  it("survives a missing issued_at rather than printing Invalid Date", () => {
    const { container } = render(<StrikeDots strikes={[strike("conduct", null, null)]} />);
    expect(text(container)).toContain("Conduct");
    expect(text(container)).not.toContain("Invalid Date");
  });
});
