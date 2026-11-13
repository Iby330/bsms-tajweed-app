export type LbRow = {
  name: string;
  pct: number;
  rank: number;
  /** Shown instead of the percentage where a figure is not the useful thing.
   *  On the hifdh board that is the surah the student is actually on: "62% of
   *  target" tells a teacher far less than "Al-Fajr". */
  note?: string;
};

/**
 * Exactly three rows: above, you, below — never a full table (plan Q11).
 *
 * At the ends the window slides back inside the list rather than being
 * clipped. Centring blindly hands two rows to whoever is first or last, and
 * a three-row board then hides its third row behind a "See all 3" button —
 * more work for the reader than simply showing it. Top of the table now
 * reads "you and the two below"; bottom, "the two above and you".
 */
export function neighbours(rows: LbRow[], selfName: string): LbRow[] {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const i = sorted.findIndex((r) => r.name === selfName);
  if (i === -1) return sorted.slice(0, 3);
  const start = Math.min(Math.max(0, i - 1), Math.max(0, sorted.length - 3));
  return sorted.slice(start, start + 3);
}
