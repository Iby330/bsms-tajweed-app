export type PageRange = { from: number; to: number };

/** The page to show inside a surah: the one asked for, clamped to the
 *  surah's pages; the first page when nothing sensible was asked for. */
export function pageWithin(requested: string | undefined, range: PageRange): number {
  const n = Number(requested);
  if (requested === undefined || requested === "" || !Number.isInteger(n)) return range.from;
  return Math.min(Math.max(n, range.from), range.to);
}

/** The mushaf's last printed page. */
export const LAST_PAGE = 604;

/**
 * The page a surah's mushaf shows: the one asked for, anywhere the reader's
 * mushaf reaches, or the surah's first page when nothing was asked. The
 * arrows used to stop at the surah's own pages, so a one-page surah could not
 * turn at all (2026-11-05).
 */
export function surahPage(requested: string | undefined, surah: PageRange, reach: PageRange): number {
  const n = Number(requested);
  if (requested === undefined || requested === "" || !Number.isInteger(n)) return surah.from;
  return Math.min(Math.max(n, reach.from), reach.to);
}
