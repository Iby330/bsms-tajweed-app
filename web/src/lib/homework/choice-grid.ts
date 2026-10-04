/**
 * "Match" and "put in order" questions — pure, no IO.
 *
 * Both are a GRID of pairings: match pairs each left-hand item with a
 * right-hand one; order pairs each place (1st, 2nd, …) with an item. Like
 * tap-the-rule (tap-words.ts) they ride on `checkbox` rather than a new
 * qtype: every option is one CELL of the grid, labelled `match:row:col` or
 * `order:row:col`, and the correct cells are the right pairing. The student
 * picks one cell per row, so the answer is the same `{selected:[…]}` as any
 * checkbox, and the student RPC — which passes an option's position, label
 * and value through and nothing else — carries everything a cell needs.
 *
 * A cell's value is its row's text and its column's text, tab-separated.
 *
 * The loader SHUFFLES the columns. The labels reach the student, so a grid
 * built in key order (`match:1:1` right, `match:1:2` wrong) would give the
 * answer away to anyone who read the page source.
 *
 * Marking is per row (`gridScore`), not per option: swapping two partners is
 * two wrong rows, where per-option scoring would also cancel two right ones.
 */

export type GridKind = "match" | "order";

export type GridOption = {
  position: number;
  label: string;
  value?: string;
  /** Teacher-side only — the student RPC strips it. */
  correct?: boolean;
};

export type ChoiceGrid = {
  kind: GridKind;
  rows: { index: number; text: string }[];
  cols: { index: number; text: string }[];
  /** The option position of row r paired with column c. */
  cell: (row: number, col: number) => number;
  /** The row and column an option position stands for. */
  at: (position: number) => { row: number; col: number } | null;
};

const CELL = /^(match|order):(\d+):(\d+)$/;

export function parseCell(label: string): { kind: GridKind; row: number; col: number } | null {
  const m = CELL.exec(label.trim());
  if (!m) return null;
  return { kind: m[1] as GridKind, row: Number(m[2]), col: Number(m[3]) };
}

/**
 * The grid these options draw, or null when they are not one: an ordinary
 * option, two kinds mixed, or a missing cell — a grid with a hole in it was
 * built wrong, and is better shown as plain options than drawn half-empty.
 */
export function choiceGrid(options: GridOption[] | null | undefined): ChoiceGrid | null {
  if (!options || options.length < 4) return null;
  const cells = options.map((o) => ({ o, c: parseCell(o.label) }));
  if (cells.some((x) => x.c === null)) return null;
  const kind = cells[0].c!.kind;
  if (cells.some((x) => x.c!.kind !== kind)) return null;

  const rowText = new Map<number, string>();
  const colText = new Map<number, string>();
  const byCell = new Map<string, number>();
  const byPosition = new Map<number, { row: number; col: number }>();
  for (const { o, c } of cells) {
    const [row, col] = (o.value ?? "").split("\t");
    rowText.set(c!.row, row ?? "");
    colText.set(c!.col, col ?? "");
    byCell.set(`${c!.row}:${c!.col}`, o.position);
    byPosition.set(o.position, { row: c!.row, col: c!.col });
  }
  if (byCell.size !== rowText.size * colText.size || byCell.size !== options.length) return null;

  const sorted = (m: Map<number, string>) =>
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([index, text]) => ({ index, text }));
  return {
    kind,
    rows: sorted(rowText),
    cols: sorted(colText),
    cell: (row, col) => byCell.get(`${row}:${col}`) ?? -1,
    at: (position) => byPosition.get(position) ?? null,
  };
}

export function isChoiceGrid(options: GridOption[] | null | undefined): boolean {
  return choiceGrid(options) !== null;
}

/**
 * The selection after pairing `row` with `col` (or clearing the row, for
 * null). One to one, both ways: the row loses its earlier pick, and any other
 * row holding that column gives it up. Picking the pair the row already has
 * clears it, so a second tap undoes the first.
 */
export function pickCell(grid: ChoiceGrid, selected: number[], row: number, col: number | null): number[] {
  const current = selected.map((p) => ({ p, at: grid.at(p) })).filter((x) => x.at !== null);
  const had = current.some((x) => x.at!.row === row && x.at!.col === col);
  const kept = current
    .filter((x) => x.at!.row !== row && (col === null || x.at!.col !== col))
    .map((x) => x.p);
  if (col === null || had) return kept;
  return [...kept, grid.cell(row, col)];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Marks for a grid: each row is worth an equal share, earned when the row's
 * ONE pick is the right cell. A row with two picks earns nothing — the form
 * never sends one, so it can only be a crafted answer.
 */
export function gridScore(grid: ChoiceGrid, correct: number[], selected: number[], points: number): number {
  const key = new Set(correct);
  const picksByRow = new Map<number, number[]>();
  for (const p of new Set(selected)) {
    const at = grid.at(p);
    if (!at) continue;
    picksByRow.set(at.row, [...(picksByRow.get(at.row) ?? []), p]);
  }
  let right = 0;
  for (const picks of picksByRow.values()) if (picks.length === 1 && key.has(picks[0])) right += 1;
  return round2((points * right) / grid.rows.length);
}

/** "1st", "2nd", "3rd", "4th" … — an order question's row heading. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
