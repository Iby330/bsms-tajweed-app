/**
 * Break a section over lines, and place its words.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * The baked geometry lays every section out as ONE line, because that is what
 * shaping produces. That is right for a 16:9 hero and wrong for a phone: the
 * longest section is 18.6em wide, so fitting it across a 1080px composition
 * leaves an em of about 50px — roughly 18 CSS pixels on a real handset, at
 * which point the tashkeel a tajweed page exists to show stops being legible.
 * Two lines roughly doubles it.
 *
 * ── What it does NOT do ────────────────────────────────────────────────────
 * It never re-shapes and never moves a glyph within its word. Every glyph
 * keeps the x the shaper gave it; a whole line is translated as one rigid
 * body. So joining, mark placement and the rule spans are all untouched by
 * wrapping — the thing that made the old DOM hero fragile (text reflowing
 * under the overlays) cannot happen here, because the overlays and the text
 * are the same objects.
 *
 * Lines are laid out right to left, as the verse reads: line 0 holds the
 * first words, which sit at the RIGHT of the baked run.
 */

import baked from "./maidah95.geometry.json";

export type Line = {
  /** Indices into the section's `words`, in reading order. */
  words: number[];
  /** Added to every glyph x on this line. */
  dx: number;
  /** Added to every glyph y on this line, downward, in font units. */
  dy: number;
  /** Width of the line's ink. */
  width: number;
};

export type SectionLayout = {
  lines: Line[];
  /** Which line each word landed on. */
  lineOfWord: number[];
  /** Width of the laid-out block — the widest line. */
  width: number;
  /** Height from the top of the first line's ink to the bottom of the last. */
  height: number;
  /** Baseline-to-baseline distance. */
  lineHeight: number;
};

/**
 * @param si      section index
 * @param maxEm   longest line allowed, in em. `Infinity` keeps one line.
 */
export function layoutSection(si: number, maxEm: number): SectionLayout {
  const s = baked.sections[si];
  const upem = baked.unitsPerEm;
  const maxW = maxEm * upem;

  // Group words into lines. Words run right to left, so a line's width is its
  // first word's right edge minus the current word's left edge.
  const groups: number[][] = [];
  let cur: number[] = [];
  for (let i = 0; i < s.words.length; i++) {
    const w = s.words[i];
    if (cur.length) {
      const right = s.words[cur[0]].x1;
      if (right - w.x0 > maxW) {
        groups.push(cur);
        cur = [i];
        continue;
      }
    }
    cur.push(i);
  }
  if (cur.length) groups.push(cur);

  const lineHeight = (s.top - s.bottom) * 1.28;

  const measured = groups.map((words) => {
    const right = s.words[words[0]].x1;
    const left = s.words[words[words.length - 1]].x0;
    return { words, left, right, width: right - left };
  });
  const width = Math.max(...measured.map((m) => m.width));

  const lines: Line[] = measured.map((m, k) => ({
    words: m.words,
    // Centre each line in the block, and shift the block's right edge to `width`.
    dx: width - m.right - (width - m.width) / 2,
    dy: k * lineHeight,
    width: m.width,
  }));

  const lineOfWord: number[] = new Array(s.words.length).fill(0);
  lines.forEach((l, k) => l.words.forEach((w) => (lineOfWord[w] = k)));

  return {
    lines,
    lineOfWord,
    width,
    height: (lines.length - 1) * lineHeight + (s.top - s.bottom),
    lineHeight,
  };
}

/** Where a word's centre sits once the section is laid out. */
export function wordAnchor(si: number, layout: SectionLayout, word: number) {
  const s = baked.sections[si];
  const line = layout.lines[layout.lineOfWord[word]];
  const w = s.words[word];
  return {
    x: (w.x0 + w.x1) / 2 + line.dx,
    /** Top of the word's ink, y UP, with the line's downward offset applied. */
    top: w.top - line.dy,
    line: layout.lineOfWord[word],
  };
}
