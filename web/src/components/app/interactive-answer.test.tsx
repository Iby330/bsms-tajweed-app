// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { InteractiveAnswer, isInteractive } from "./interactive-answer";
import { REGIONS } from "@/lib/homework/diagram";

afterEach(cleanup);

// A 3-pair match with the right-hand column shuffled, as the loader builds it.
// Key: تحقيق → The slowest (col 2), حدر → The fastest (col 0), تدوير → In the middle (col 1).
const RIGHTS = ["The fastest", "In the middle", "The slowest"];
const LEFTS = ["تحقيق", "حدر", "تدوير"];
const KEY = [2, 0, 1];
const grid = (kind: "match" | "order", rows = LEFTS) =>
  rows.flatMap((l, r) => RIGHTS.map((c, col) => ({
    position: r * 3 + col, label: `${kind}:${r}:${col}`, value: `${l}\t${c}`, correct: KEY[r] === col,
  })));

describe("isInteractive", () => {
  it("knows every interactive shape and nothing else", () => {
    expect(isInteractive(grid("match"))).toBe(true);
    expect(isInteractive([{ position: 0, label: "Option A", value: "Idghaam" }, { position: 1, label: "Option B", value: "Iqlaab" }])).toBe(false);
  });
});

describe("match", () => {
  it("pairs a left item with an answer from its dropdown", () => {
    const onChange = vi.fn();
    render(<InteractiveAnswer options={grid("match")} selected={[]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Match for حدر"), { target: { value: "0" } });
    expect(onChange).toHaveBeenCalledWith([3]); // row 1, col 0
  });

  it("moves an answer another row already holds", () => {
    const onChange = vi.fn();
    render(<InteractiveAnswer options={grid("match")} selected={[3]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Match for تحقيق"), { target: { value: "0" } });
    expect(onChange).toHaveBeenCalledWith([0]);
  });

  it("says, once marked, which rows were wrong and what was right", () => {
    // Row 0 right (col 2); rows 1 and 2 swapped.
    render(<InteractiveAnswer options={grid("match")} selected={[2, 4, 6]} readOnly reveal />);
    expect(screen.getAllByText(/Right/)).toHaveLength(1);
    expect(screen.getByText("The fastest", { selector: "span" })).toBeTruthy();
  });
});

describe("order", () => {
  // Rows are places 1st–3rd; columns are the items.
  const order = grid("order", ["1st", "2nd", "3rd"]);

  it("gives the first item tapped the first place", () => {
    const onChange = vi.fn();
    render(<InteractiveAnswer options={order} selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "The slowest" }));
    expect(onChange).toHaveBeenCalledWith([2]); // row 0, col 2
  });

  it("gives the next item the next free place", () => {
    const onChange = vi.fn();
    render(<InteractiveAnswer options={order} selected={[2]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "In the middle" }));
    expect(onChange).toHaveBeenCalledWith([2, 4]); // row 1, col 1
  });

  it("takes a placed item out again", () => {
    const onChange = vi.fn();
    render(<InteractiveAnswer options={order} selected={[2, 4]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "The slowest, placed 1st" }));
    expect(onChange).toHaveBeenCalledWith([4]);
  });
});

describe("diagram", () => {
  const places = Object.keys(REGIONS).map((r, i) => ({
    position: i, label: `diagram:${r}`, value: REGIONS[r as keyof typeof REGIONS], correct: r === "lips",
  }));

  it("picks a place on the drawing, and a second tap undoes it", () => {
    const onChange = vi.fn();
    const { rerender } = render(<InteractiveAnswer options={places} selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: REGIONS.lips }));
    expect(onChange).toHaveBeenLastCalledWith([1]);
    rerender(<InteractiveAnswer options={places} selected={[1]} onChange={onChange} />);
    expect(screen.getByText(/You picked: The lips/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: REGIONS.lips }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("works from the keyboard", () => {
    const onChange = vi.fn();
    render(<InteractiveAnswer options={places} selected={[]} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: REGIONS.nose }), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith([0]);
  });

  it("names the answer when the pick was wrong", () => {
    render(<InteractiveAnswer options={places} selected={[0]} readOnly reveal />);
    expect(screen.getByText(/Answer: The lips/)).toBeTruthy();
  });
});

describe("tap letters", () => {
  const L = (position: number, label: string, value: string, correct = false) => ({ position, label, value, correct });
  const letters = [
    L(1, "L:1:6:2:1", "ٱ"), L(2, "L:1:6:2:2", "ل"), L(3, "L:1:6:2:3", "صِّ", true), L(4, "L:1:6:2:4", "رَٰ"), L(5, "L:1:6:2:5", "طَ", true),
  ];

  it("keeps the word joined: its letters are spans inside one word, not buttons", () => {
    const { container } = render(<InteractiveAnswer options={letters} selected={[]} onChange={() => {}} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelector(".tap-letters")!.textContent).toContain("ٱلصِّرَٰطَ");
  });

  it("toggles a letter by tap or keyboard", () => {
    const onChange = vi.fn();
    render(<InteractiveAnswer options={letters} selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "letter صِّ" }));
    expect(onChange).toHaveBeenLastCalledWith([3]);
    fireEvent.keyDown(screen.getByRole("checkbox", { name: "letter طَ" }), { key: " " });
    expect(onChange).toHaveBeenLastCalledWith([5]);
  });
});
