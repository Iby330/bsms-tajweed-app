import { describe, expect, it } from "vitest";
import {
  choiceGrid,
  gridScore,
  isChoiceGrid,
  parseCell,
  pickCell,
  type GridOption,
} from "./choice-grid";

/**
 * A three-pair match, built the way the loader builds one: the right-hand
 * column is shuffled, so right item 0 is NOT the partner of left item 0.
 * Key: تحقيق → slowest (col 2), حدر → fastest (col 0), تدوير → middle (col 1).
 */
const RIGHTS = ["The fastest", "In the middle", "The slowest"];
const LEFTS = ["تحقيق", "حدر", "تدوير"];
const KEY = [2, 0, 1];
const match: GridOption[] = LEFTS.flatMap((l, r) =>
  RIGHTS.map((c, col) => ({
    position: r * 3 + col,
    label: `match:${r}:${col}`,
    value: `${l}\t${c}`,
    correct: KEY[r] === col,
  })),
);
const cell = (r: number, c: number) => r * 3 + c;

describe("parseCell", () => {
  it("reads the kind, row and column", () => {
    expect(parseCell("match:2:0")).toEqual({ kind: "match", row: 2, col: 0 });
    expect(parseCell("order:0:3")).toEqual({ kind: "order", row: 0, col: 3 });
  });

  it("rejects anything else", () => {
    expect(parseCell("Option A")).toBeNull();
    expect(parseCell("78:14:3")).toBeNull();
    expect(parseCell("match:1")).toBeNull();
  });
});

describe("isChoiceGrid", () => {
  it("recognises a full grid", () => {
    expect(isChoiceGrid(match)).toBe(true);
  });

  it("refuses ordinary options and mixed kinds", () => {
    expect(isChoiceGrid([{ position: 0, label: "Option A", value: "x" }])).toBe(false);
    expect(isChoiceGrid(null)).toBe(false);
    const mixed = match.map((o, i) => (i === 0 ? { ...o, label: "order:0:0" } : o));
    expect(isChoiceGrid(mixed)).toBe(false);
  });

  it("refuses a grid with a missing cell rather than drawing a hole", () => {
    expect(isChoiceGrid(match.slice(1))).toBe(false);
  });
});

describe("choiceGrid", () => {
  it("lays out the rows and the columns with their text", () => {
    const g = choiceGrid(match)!;
    expect(g.kind).toBe("match");
    expect(g.rows.map((r) => r.text)).toEqual(LEFTS);
    expect(g.cols.map((c) => c.text)).toEqual(RIGHTS);
    expect(g.cell(1, 2)).toBe(cell(1, 2));
  });
});

describe("pickCell", () => {
  const g = choiceGrid(match)!;

  it("pairs a row with a column", () => {
    expect(pickCell(g, [], 0, 2)).toEqual([cell(0, 2)]);
  });

  it("replaces the row's earlier pick", () => {
    expect(pickCell(g, [cell(0, 1)], 0, 2)).toEqual([cell(0, 2)]);
  });

  /** One to one: a right-hand answer can't be the partner of two lefts. */
  it("takes the column away from the row that had it", () => {
    expect(pickCell(g, [cell(1, 2)], 0, 2).sort()).toEqual([cell(0, 2)]);
  });

  it("clears the row when the same pair is picked again", () => {
    expect(pickCell(g, [cell(0, 2)], 0, 2)).toEqual([]);
  });

  it("clears the row when given no column", () => {
    expect(pickCell(g, [cell(0, 2), cell(1, 0)], 0, null)).toEqual([cell(1, 0)]);
  });
});

describe("gridScore", () => {
  const g = choiceGrid(match)!;
  const key = match.filter((o) => o.correct).map((o) => o.position);

  it("gives full marks for the full key", () => {
    expect(gridScore(g, key, key, 3)).toBe(3);
  });

  /**
   * Swapping two partners is two wrong rows, not a reason for zero: each row
   * is worth its share, and a wrong row costs only itself. Per-option
   * scoring, where a wrong pick cancels a right one, scored this 0 of 3.
   */
  it("gives each right row its share, wrong rows costing only themselves", () => {
    const swapped = [cell(0, 2), cell(1, 1), cell(2, 0)];
    expect(gridScore(g, key, swapped, 3)).toBe(1);
  });

  it("counts nothing for a row with two picks", () => {
    expect(gridScore(g, key, [cell(0, 2), cell(0, 1), cell(1, 0)], 3)).toBe(1);
  });

  it("rounds to two places", () => {
    expect(gridScore(g, key, [cell(0, 2)], 4)).toBe(1.33);
  });
});
