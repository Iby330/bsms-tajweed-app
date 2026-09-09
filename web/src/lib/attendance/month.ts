import { isoDate } from "./session";

/**
 * Month-grid arithmetic, shared by the register's date picker and the year
 * calendar so the two lay a month out identically.
 *
 * A month is identified by the "2026-10" prefix of any date inside it, which
 * makes ordering and comparison plain string work.
 */
export type Month = string;

export function monthOf(iso: string): Month {
  return iso.slice(0, 7);
}

export function shiftMonth(month: Month, by: number): Month {
  const [y, m] = month.split("-").map(Number);
  return monthOf(isoDate(new Date(y, m - 1 + by, 1, 12)));
}

/** Every month from `from` to `to` inclusive. */
export function monthsBetween(from: string, to: string): Month[] {
  const out: Month[] = [];
  for (let m = monthOf(from); m <= monthOf(to); m = shiftMonth(m, 1)) out.push(m);
  return out;
}

/**
 * The days of a month laid out Monday-first, padded with nulls so the grid
 * starts on the right weekday and ends on a whole row.
 */
export function monthGrid(month: Month): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const lead = (new Date(y, m - 1, 1, 12).getDay() + 6) % 7; // Sunday is 0
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(isoDate(new Date(y, m - 1, d, 12)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export const monthLabel = (month: Month) =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

/** Monday-first column headings. */
export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;
