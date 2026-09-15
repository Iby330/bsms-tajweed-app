export type PageRange = { from: number; to: number };

/** The page to show inside a surah: the one asked for, clamped to the
 *  surah's pages; the first page when nothing sensible was asked for. */
export function pageWithin(requested: string | undefined, range: PageRange): number {
  const n = Number(requested);
  if (requested === undefined || requested === "" || !Number.isInteger(n)) return range.from;
  return Math.min(Math.max(n, range.from), range.to);
}
