// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import { InteractiveAnswer } from "./interactive-answer";
import { isInteractive } from "@/lib/homework/interactive";

afterEach(cleanup);

const opt = (position: number, loc: string, rule: string, value: string, key: { correct?: boolean; inst?: string } = {}) => ({
  position, label: `H:91:${loc}:${rule}`, value, ...key,
});
// A word of two letters and a word of one; the first letter is a lām to find.
const OPTIONS = [
  opt(0, "1:1:1", "lam_shamsi", "ل", { correct: true, inst: "lam_shamsi-1" }),
  opt(1, "1:1:1", "hams", "ل"),
  opt(2, "1:1:2", "lam_shamsi", "شَّ", { correct: true, inst: "lam_shamsi-1" }),
  opt(3, "1:1:2", "hams", "شَّ", { correct: true }),
  opt(4, "1:2:1", "lam_shamsi", "قَ"),
  opt(5, "1:2:1", "hams", "قَ"),
];
const letter = (c: HTMLElement, i: number) => c.querySelectorAll<HTMLElement>(".hunt-letter")[i];

describe("RuleHunt", () => {
  it("is an interactive question, one letter to a span however many rules it offers", () => {
    expect(isInteractive(OPTIONS)).toBe(true);
    const { container } = render(<InteractiveAnswer options={OPTIONS} selected={[]} onChange={() => {}} />);
    expect(container.querySelectorAll(".hunt-letter")).toHaveLength(3);
  });

  it("with a rule picked, a tapped letter takes that rule, and a second tap removes it", () => {
    let picked: number[] = [];
    const { container, getByRole, rerender } = render(
      <InteractiveAnswer options={OPTIONS} selected={[]} onChange={(n) => (picked = n)} />,
    );
    fireEvent.click(getByRole("button", { name: "Hams" }));
    fireEvent.click(letter(container, 2));
    expect(picked).toEqual([5]);
    rerender(<InteractiveAnswer options={OPTIONS} selected={[5]} onChange={(n) => (picked = n)} />);
    fireEvent.click(letter(container, 2));
    expect(picked).toEqual([]);
  });

  it("with no rule picked, a tapped letter opens its rules", () => {
    let picked: number[] = [];
    const { container, getByRole } = render(
      <InteractiveAnswer options={OPTIONS} selected={[]} onChange={(n) => (picked = n)} />,
    );
    fireEvent.click(letter(container, 1));
    expect(picked).toEqual([]);
    fireEvent.click(within(getByRole("dialog")).getByRole("button", { name: "Hams" }));
    expect(picked).toEqual([3]);
  });

  it("offers no rule to pick once read-only", () => {
    const { queryByRole } = render(<InteractiveAnswer options={OPTIONS} selected={[3]} readOnly />);
    expect(queryByRole("toolbar")).toBeNull();
  });

  it("marks found, wrong and accepted, and a found thing's other letters are not missed", () => {
    const { container, getByText, getAllByText } = render(<InteractiveAnswer options={OPTIONS} selected={[0, 3, 5]} readOnly reveal />);
    expect(letter(container, 0).dataset.state).toBe("hit");
    expect(letter(container, 1).dataset.state).toBe("hit"); // hams accepted; the lām is found already
    expect(letter(container, 2).dataset.state).toBe("wrong");
    expect(getByText("1 of 1 found")).toBeTruthy();
    // Every rule but lām shamsiyyah has nothing to find in this passage.
    expect(getAllByText("none to find")).toHaveLength(5);
  });

  it("marks every letter of a thing missed", () => {
    const { container } = render(<InteractiveAnswer options={OPTIONS} selected={[]} readOnly reveal />);
    expect(letter(container, 0).dataset.state).toBe("missed");
    expect(letter(container, 1).dataset.state).toBe("missed");
    expect(letter(container, 2).dataset.state).toBeUndefined();
  });
});
