/** One word of the seeded Uthmani text, positioned in the Madani mushaf. */
export type QuranWord = {
  surah: number;
  ayah: number;
  position: number; // 1-based within the ayah
  text: string;
  glyph: string | null; // QCF v2 page-font character — the printed word itself
  isEnd: boolean;   // ayah-end marker (the numeral)
  page: number;
  line: number;
};

export type QuranWordRow = {
  surah_number: number;
  ayah_number: number;
  word_position: number;
  text_uthmani: string;
  code_v1: string | null;
  code_v2: string | null;
  is_end: boolean;
  page_number: number;
  line_number: number;
};

export type MushafLine = { line: number; words: QuranWord[] };
export type MushafPage = { page: number; lines: MushafLine[] };

export const wordKey = (w: Pick<QuranWord, "surah" | "ayah" | "position">): string =>
  `${w.surah}:${w.ayah}:${w.position}`;

// V2 only — never fall back to code_v1 per word: the glyph must match the
// page font's edition, so a missing v2 glyph drops the PAGE to Unicode
// rendering (the reader's glyphMode check) rather than mixing editions.
export const fromRow = (r: QuranWordRow): QuranWord => ({
  surah: r.surah_number, ayah: r.ayah_number, position: r.word_position,
  text: r.text_uthmani, glyph: r.code_v2, isEnd: r.is_end,
  page: r.page_number, line: r.line_number,
});

/**
 * Lines the print centres instead of stretching to the margins — closing
 * lines of surahs, mostly. This is quran.com's production table
 * (src/components/Verse/pageUtils.ts, QCF v1), trimmed to the pages the
 * app can render; the print itself is the authority it encodes.
 */
const CENTER_ALIGNED_PAGE_LINES: Record<number, number[]> = {
  586: [1], 593: [2], 594: [5], 600: [10],
  602: [5, 15], 603: [10, 15], 604: [4, 9, 14, 15],
};

/** Should this printed line centre rather than fill the measure? */
export function isCenteredLine(page: number, line: number): boolean {
  return CENTER_ALIGNED_PAGE_LINES[page]?.includes(line) ?? false;
}

/** DB order (ayah asc, position asc) IS mushaf reading order within a surah;
 *  grouping by consecutive page/line values reproduces the printed lines. */
export function groupIntoPages(words: QuranWord[]): MushafPage[] {
  const pages: MushafPage[] = [];
  for (const w of words) {
    let page = pages[pages.length - 1];
    if (!page || page.page !== w.page) {
      page = { page: w.page, lines: [] };
      pages.push(page);
    }
    let line = page.lines[page.lines.length - 1];
    if (!line || line.line !== w.line) {
      line = { line: w.line, words: [] };
      page.lines.push(line);
    }
    line.words.push(w);
  }
  return pages;
}
