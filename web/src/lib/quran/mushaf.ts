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

// V1 (1405H) — the school's physical mushaf, confirmed by its own line
// breaks (Al-Ikhlas splits لم يلد / ولم يولد). Glyph edition must match
// the page fonts AND the seeded line data; never mix editions per word.
export const fromRow = (r: QuranWordRow): QuranWord => ({
  surah: r.surah_number, ayah: r.ayah_number, position: r.word_position,
  text: r.text_uthmani, glyph: r.code_v1, isEnd: r.is_end,
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

export type PageSlot =
  | { type: "words"; line: MushafLine }
  | { type: "header"; surah: number }
  | { type: "basmala" };

/**
 * Every printed page is EXACTLY 15 numbered lines. Word data only covers
 * lines that carry ayah words; the print reserves the gaps for surah
 * headers and basmalas — including a header whose surah's words only
 * begin on the NEXT page. Reconstruct the full 15 slots:
 *  - a gap run of 2 before a surah's opening words = header + basmala;
 *  - a single gap before them = basmala (its header closed the previous
 *    page);
 *  - trailing gaps after the page's last words belong to the next surah
 *    in mushaf order: header, then basmala.
 */
export function pageSlots(page: MushafPage): PageSlot[] {
  const byLine = new Map(page.lines.map((l) => [l.line, l]));
  const lastSurah = page.lines.at(-1)?.words.at(-1)?.surah ?? 0;
  const slots: PageSlot[] = [];
  for (let n = 1; n <= 15; n++) {
    const line = byLine.get(n);
    if (line) {
      slots.push({ type: "words", line });
      continue;
    }
    let next: MushafLine | undefined;
    for (let m = n + 1; m <= 15 && !next; m++) next = byLine.get(m);
    if (next) {
      const w = next.words[0];
      const opener = w.ayah === 1 && w.position === 1;
      let gapRun = 0;
      for (let m = n; m <= 15 && !byLine.get(m); m++) gapRun++;
      if (opener && gapRun >= 2) slots.push({ type: "header", surah: w.surah });
      else slots.push({ type: "basmala" });
    } else {
      const prev = slots[slots.length - 1];
      slots.push(
        prev?.type === "header" ? { type: "basmala" } : { type: "header", surah: lastSurah + 1 },
      );
    }
  }
  return slots;
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
