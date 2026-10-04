"use client";

import { choiceGrid, ordinal, pickCell, type GridOption } from "@/lib/homework/choice-grid";
import { MixedText } from "@/components/app/mixed-text";
import { cn } from "@/lib/utils";

/**
 * A match or put-in-order question — see lib/homework/choice-grid.ts for the
 * shape underneath.
 *
 * MATCH sets each left-hand item beside a dropdown of the right-hand ones: a
 * native select, because on a phone it opens the system picker, which reads
 * long answers in full and needs no dragging. Choosing an answer another row
 * already holds moves it here.
 *
 * ORDER is tapped into place: the first item tapped is 1st, the next 2nd, and
 * tapping a numbered item takes it out again. No dragging — dragging a list
 * on a phone fights the page's own scrolling.
 *
 * `reveal` is the marked view (teacher-side, and a student's approved work):
 * each row says whether it was right, and what was, when it wasn't.
 */
export function ChoiceGridView({
  options,
  selected,
  onChange,
  readOnly = false,
  reveal = false,
}: {
  options: GridOption[];
  selected: number[];
  onChange?: (next: number[]) => void;
  readOnly?: boolean;
  reveal?: boolean;
}) {
  const grid = choiceGrid(options);
  if (!grid) return null;

  const correct = new Set(options.filter((o) => o.correct).map((o) => o.position));
  const pickOf = new Map<number, number>(); // row → col
  for (const p of selected) {
    const at = grid.at(p);
    if (at) pickOf.set(at.row, at.col);
  }
  const keyColOf = (row: number) => grid.cols.find((c) => correct.has(grid.cell(row, c.index)))?.index;
  const colText = (col: number | undefined) => grid.cols.find((c) => c.index === col)?.text ?? "";
  const set = (row: number, col: number | null) => {
    if (!readOnly && onChange) onChange(pickCell(grid, selected, row, col));
  };

  /** A row's verdict once marked: right, wrong (with the answer), or missed. */
  const verdict = (row: number) => {
    if (!reveal) return null;
    const pick = pickOf.get(row);
    const key = keyColOf(row);
    if (pick !== undefined && pick === key) return <span className="text-xs text-ok">✓ Right</span>;
    return (
      <span className={cn("text-xs", pick === undefined ? "text-warn" : "text-danger")}>
        {pick === undefined ? "Not answered. " : "✗ "}Answer: <MixedText text={colText(key)} variant="quran" />
      </span>
    );
  };

  if (grid.kind === "match") {
    return (
      <ul className="space-y-2">
        {grid.rows.map((r) => {
          const pick = pickOf.get(r.index);
          return (
            <li key={r.index} className="rounded-md border border-line px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <MixedText text={r.text} variant="quran" className="min-w-0 flex-1 text-sm font-medium" />
                <select
                  aria-label={`Match for ${r.text}`}
                  disabled={readOnly}
                  value={pick ?? ""}
                  onChange={(e) => set(r.index, e.target.value === "" ? null : Number(e.target.value))}
                  className={cn(
                    "max-w-full rounded-md border bg-page px-2 py-1.5 text-sm",
                    pick === undefined ? "border-line text-muted-foreground" : "border-ink",
                    reveal && pick !== undefined && (pick === keyColOf(r.index) ? "border-ok" : "border-danger"),
                  )}
                >
                  <option value="">Choose…</option>
                  {grid.cols.map((c) => (
                    <option key={c.index} value={c.index}>{c.text}</option>
                  ))}
                </select>
              </div>
              {reveal && <div className="mt-1.5">{verdict(r.index)}</div>}
            </li>
          );
        })}
      </ul>
    );
  }

  // ORDER: rows are places, columns are items.
  const placeOf = new Map<number, number>(); // col → row
  for (const [row, col] of pickOf) placeOf.set(col, row);
  const tap = (col: number) => {
    const placed = placeOf.get(col);
    if (placed !== undefined) return set(placed, null);
    const free = grid.rows.find((r) => !pickOf.has(r.index));
    if (free) set(free.index, col);
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {grid.cols.map((c) => {
          const place = placeOf.get(c.index);
          const keyRow = grid.rows.find((r) => correct.has(grid.cell(r.index, c.index)))?.index;
          const right = reveal && place !== undefined && place === keyRow;
          return (
            <li key={c.index}>
              <button
                type="button"
                disabled={readOnly}
                aria-pressed={place !== undefined}
                aria-label={place !== undefined ? `${c.text}, placed ${ordinal(place + 1)}` : c.text}
                onClick={() => tap(c.index)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-start text-sm transition-colors",
                  place !== undefined ? "border-ink bg-muted" : "border-line hover:bg-muted/60",
                  reveal && place !== undefined && (right ? "border-ok bg-ok/10" : "border-danger bg-danger/10"),
                  readOnly && "cursor-default",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-7 min-w-11 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums",
                    place !== undefined ? "border-ink bg-ink text-page" : "border-dashed border-line text-muted-foreground",
                  )}
                >
                  {place !== undefined ? ordinal(place + 1) : "·"}
                </span>
                <MixedText text={c.text} variant="quran" className="min-w-0 flex-1" />
                {reveal && keyRow !== undefined && !right && (
                  <span className="shrink-0 text-xs text-warn">should be {ordinal(keyRow + 1)}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!readOnly && !reveal && (
        <p className="text-xs text-muted-foreground">
          Tap them in order, first to last. Tap one again to take it out. {pickOf.size} of {grid.rows.length} placed.
        </p>
      )}
    </div>
  );
}
