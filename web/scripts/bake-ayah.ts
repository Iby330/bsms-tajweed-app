/**
 * Bake Al-Ma'idah 5:95 into fixed glyph geometry.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * The previous hero measured Arabic in the browser with `Range` over a live
 * text node. That is the fragile way to do it, and it failed in exactly the
 * ways it was always going to: letters could not be addressed individually
 * (a Range gives you a box, not a glyph), marks landed in the wrong places,
 * and every measurement depended on `document.fonts.ready` having fired and
 * on the line never reflowing.
 *
 * So we do the shaping ONCE, here, at build time, with the same engine class
 * a browser uses — the font's own GSUB/GPOS tables — and commit the result.
 * What ships is a list of glyph outlines with absolute positions. At runtime
 * there is no text node, no font metric to wait for, no reflow, and nothing
 * to measure. The ball's target for word 4 is a number in a JSON file.
 *
 * That buys three things the DOM version could not have:
 *   · Per-LETTER colour. Every glyph is its own <path>, so a rule that lives
 *     on one letter lights one letter — not the word around it.
 *   · Marks where the font says. Fatha, sukun, tanween and the silent-alif
 *     ring are placed by the font's mark-to-base anchors, not by guesswork.
 *   · Identical output in the Player and in a rendered MP4.
 *
 * ── The font ───────────────────────────────────────────────────────────────
 * MUST be the patched uthmanic_hafs_v22.ttf — see execution/patch_uthmanic_hafs.py.
 * The stock font draws U+06DF (the silent-alif ring in ءَامَنُوا۟ and
 * تَقْتُلُوا۟) as an em-sized ornament on the baseline in its own advance slot.
 * The patch makes it a zero-width mark and copies U+06E0's anchors into the
 * twelve mark-to-base lookups. This script asserts the repair below, because
 * baking geometry from an unpatched font would silently ship the defect.
 *
 * ── Output ─────────────────────────────────────────────────────────────────
 * src/lib/tajweed/maidah95.geometry.json. Coordinates are in FONT UNITS
 * (2048/em), rounded to whole units, y up, origin at the baseline of a
 * left-to-right visual layout. Outlines are stored once in `outlines` and
 * glyphs point at them by index. A glyph renders as:
 *     <g transform="translate(x, -y) scale(1,-1)"><path d={outlines[o]} /></g>
 * Callers scale the whole section to fit; nothing here assumes a pixel size.
 *
 * Run: npx tsx scripts/bake-ayah.ts
 */

import * as fontkit from "fontkit";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAIDAH_95, type Rule, type Section } from "../src/lib/tajweed/maidah95";
import { LETTERS } from "../src/lib/tajweed/maidah95.letters";

const FONT = resolve(__dirname, "../public/fonts/uthmanic_hafs_v22.ttf");
const OUT = resolve(__dirname, "../src/lib/tajweed/maidah95.geometry.json");

/* ── types, mirrored in geometry.ts ──────────────────────────────────────── */

type BakedGlyph = {
  /**
   * Index into the top-level `outlines`. An outline is stored once however
   * often it appears: 361 glyphs in this ayah use only 102 distinct shapes —
   * every fatha, sukun and alif is the same path — so inlining each one tripled
   * the file for nothing.
   */
  o: number;
  /** Pen x plus the shaper's x-offset, font units. */
  x: number;
  /** The shaper's y-offset from the baseline, y UP. 0 for base letters. */
  y: number;
  /** Index into `words`. Marks belong to the word of the letter they sit on. */
  w: number;
  /** True for zero-advance marks — tashkeel, sukun, tanween, the silent ring. */
  mark: boolean;
};

type BakedWord = {
  i: number;
  text: string;
  /** Glyph indices belonging to this word, ascending (visual order). */
  g: number[];
  /** Visual extent of the word's BASE letters, font units. */
  x0: number;
  x1: number;
  /** Where the ball should land: the top of the word's ink, font units, y UP. */
  top: number;
};

type BakedRule = {
  id: string;
  /** Glyph indices this rule lights. */
  g: number[];
  /** Visual extent of those glyphs, for the underline mark. */
  x0: number;
  x1: number;
  /** The word the callout should point at (the first word of the span). */
  w: number;
};

type BakedSection = {
  id: string;
  text: string;
  width: number;
  /** Ink extremes across the whole section, font units, y UP. */
  top: number;
  bottom: number;
  glyphs: Array<Omit<BakedGlyph, "o"> & { d: string }>;
  words: BakedWord[];
  rules: BakedRule[];
};

/* ── shaping ─────────────────────────────────────────────────────────────── */

const font = fontkit.openSync(FONT) as any;

/**
 * Prove the U+06DF repair is present before we bake anything from this font.
 * An unpatched build gives advance 1442 and GDEF class 1; the patch gives a
 * zero advance and mark class. Baking the unpatched glyph would put an
 * em-sized ring on the baseline of two words and push the rest of the line.
 */
function assertPatchedFont() {
  const probe = font.layout("ءَامَنُوا۟", undefined, "arab", "ARA", "rtl");
  const ring = probe.glyphs
    .map((g: any, i: number) => ({ g, p: probe.positions[i] }))
    .find((o: any) => o.g.codePoints.includes(0x06df));
  if (!ring) throw new Error("U+06DF not produced by the shaper — wrong text or font.");
  if (ring.p.xAdvance !== 0) {
    throw new Error(
      `U+06DF has advance ${ring.p.xAdvance}, expected 0. This is the UNPATCHED ` +
        `font. Run execution/patch_uthmanic_hafs.py first — baking from this ` +
        `build would ship an orthographic error in the text of the Qur'an.`,
    );
  }
  if (ring.p.yOffset <= 0) {
    throw new Error(`U+06DF sits at yOffset ${ring.p.yOffset}; expected it above the baseline.`);
  }
}

/**
 * Canonical combining classes for the Arabic marks this text uses.
 * Anything absent is treated as 0 — not a reorderable combining mark. U+06E5
 * and U+06E6 (the small waw and yeh of madd silah) are deliberately absent:
 * they are modifier LETTERS, not marks, and must never be moved.
 */
const CCC: Record<number, number> = {
  0x064b: 27, 0x064c: 28, 0x064d: 29, 0x064e: 30, 0x064f: 31, 0x0650: 32,
  0x0651: 33, 0x0652: 34, 0x0670: 35,
  0x0653: 230, 0x0654: 230, 0x0655: 220, 0x0656: 220, 0x0657: 230, 0x0658: 230,
  0x0659: 230, 0x065a: 230, 0x065b: 230, 0x065c: 220, 0x065d: 220, 0x065e: 220,
  0x065f: 220,
  0x06d6: 230, 0x06d7: 230, 0x06d8: 230, 0x06d9: 230, 0x06da: 230, 0x06db: 230,
  0x06dc: 230, 0x06df: 230, 0x06e0: 230, 0x06e1: 230, 0x06e2: 230, 0x06e3: 220,
  0x06e4: 230, 0x06e7: 230, 0x06e8: 230, 0x06ea: 220, 0x06eb: 230, 0x06ec: 230,
  0x06ed: 220,
};

/**
 * HarfBuzz's MODIFIED combining class.
 *
 * This is the whole fix, and it is not our invention — it is what every
 * browser does. HarfBuzz remaps the Arabic classes so that SHADDA sorts
 * BEFORE the vowels rather than after them (hb-unicode.hh,
 * HB_MODIFIED_COMBINING_CLASS_CCC33 = 27, with 27..32 each shifted up one).
 *
 * Why it matters here: the font's mark-to-mark lookups attach a vowel to a
 * shadda, so the shadda has to reach the shaper FIRST. Unicode canonical order
 * puts it last — fatha is ccc 30, shadda is 33 — and fontkit shapes exactly
 * what it is given. The result was a fatha sitting ON the shadda at the same
 * height instead of stacked above it, which is what a reader notices
 * immediately and what the mushaf never does.
 *
 * Measured, on ٱلَّذِينَ: canonical order puts the fatha at y=1515 against a
 * shadda at 1540 — 25 units BELOW it. Reordered, the fatha lands at 1840,
 * ~300 units above, and the word's ink top then matches what the browser
 * draws to within a pixel.
 *
 * The STORED text stays canonical. This reordering happens only on the way
 * into the shaper, and `perm` carries every glyph back to the character it
 * came from, so `maidah95.letters.ts` keeps naming letters of the real text.
 */
function modifiedCcc(cp: number): number {
  const c = CCC[cp] ?? 0;
  if (c === 33) return 27; // shadda, ahead of the vowels
  if (c >= 27 && c <= 32) return c + 1;
  return c;
}

/**
 * Reorder combining marks the way HarfBuzz would, returning the string to
 * shape and `perm`, where `perm[i]` is the ORIGINAL index of shaped char `i`.
 *
 * Only runs of true combining marks (ccc > 0) are sorted, and the sort is
 * stable, so nothing moves except a shadda hopping in front of the vowels it
 * shares a base with. A ccc-0 character ends the run and is never moved.
 */
function reorderMarks(text: string): { shaped: string; perm: number[] } {
  const chars = Array.from(text);
  const perm: number[] = [];
  let i = 0;
  while (i < chars.length) {
    const cp = chars[i].codePointAt(0)!;
    if ((CCC[cp] ?? 0) === 0) {
      perm.push(i);
      i++;
      continue;
    }
    let j = i;
    while (j < chars.length && (CCC[chars[j].codePointAt(0)!] ?? 0) !== 0) j++;
    const run = [];
    for (let k = i; k < j; k++) run.push(k);
    run.sort((a, b) => {
      const d = modifiedCcc(chars[a].codePointAt(0)!) - modifiedCcc(chars[b].codePointAt(0)!);
      return d !== 0 ? d : a - b; // stable
    });
    perm.push(...run);
    i = j;
  }
  return { shaped: perm.map((k) => chars[k]).join(""), perm };
}

/**
 * Map each shaped glyph back to the source characters it came from.
 *
 * fontkit gives us each glyph's `codePoints` but no string indices, so we
 * recover them. It returns an RTL run in VISUAL order — leftmost glyph first,
 * which is the LAST character of the string — so we walk the glyphs backwards
 * and match their codepoints against the still-unconsumed source characters.
 *
 * It is NOT a sequential walk, and assuming it was is what the first version
 * got wrong. Shaping can ligate across an intervening mark: in يَـ__ٰٓأ the
 * ya and the tatweel become one glyph (`afii57450.init_calt`, U+064A+U+0640)
 * while the fatha BETWEEN them (U+064E) is emitted as its own glyph. So a
 * glyph can own a non-contiguous pair of characters, and a later glyph picks
 * up the one it stepped over.
 *
 * Hence: for each codepoint, take the earliest unconsumed source character
 * that matches, within a short lookahead. Every character must be claimed
 * exactly once — checked at the end, because a silent drift here would put
 * every rule's colour on the wrong letters.
 */
const LOOKAHEAD = 8;

function mapGlyphsToChars(run: any, text: string): number[][] {
  const src = Array.from(text).map((c) => c.codePointAt(0)!);
  const taken = new Array<boolean>(src.length).fill(false);
  const owned: number[][] = new Array(run.glyphs.length);
  let frontier = 0;

  for (let i = run.glyphs.length - 1; i >= 0; i--) {
    const cps: number[] = run.glyphs[i].codePoints;
    const mine: number[] = [];
    for (const cp of cps) {
      let found = -1;
      for (let j = frontier; j < Math.min(src.length, frontier + LOOKAHEAD); j++) {
        if (!taken[j] && src[j] === cp) {
          found = j;
          break;
        }
      }
      if (found < 0) {
        throw new Error(
          `Could not place U+${cp.toString(16).toUpperCase()} from glyph ${i} ` +
            `(${run.glyphs[i].name}) within ${LOOKAHEAD} chars of position ${frontier} ` +
            `in "${text}".`,
        );
      }
      taken[found] = true;
      mine.push(found);
    }
    owned[i] = mine;
    while (frontier < src.length && taken[frontier]) frontier++;
  }

  const orphans = taken.flatMap((t, j) => (t ? [] : [j]));
  if (orphans.length) {
    throw new Error(
      `${orphans.length} character(s) unclaimed in "${text}" at ${orphans.join(",")} ` +
        `(U+${orphans.map((j) => src[j].toString(16)).join(", U+")}).`,
    );
  }
  return owned;
}

/** Character index ranges of each word in the joined section text. */
function wordRanges(words: readonly string[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let at = 0;
  for (const w of words) {
    const n = Array.from(w).length;
    out.push([at, at + n]);
    at += n + 1; // the joining space
  }
  return out;
}

/**
 * Which characters of the section a rule actually covers.
 *
 * A rule names WORDS (`from`..`to`). If it also names `letters`, we narrow to
 * those letters inside the named word — that is what makes the highlight land
 * on the qaf rather than on تَقْتُلُوا۟ entire. `letters` is matched as a
 * substring of the word so that a teacher reviewing this file reads "قْ in
 * تَقْتُلُوا۟" rather than a pair of integers.
 */
function ruleCharSpans(rule: Rule, section: Section, ranges: Array<[number, number]>) {
  const spans: Array<[number, number]> = [];
  const letters = LETTERS[rule.id];

  if (letters?.length) {
    for (const { w, t, nth = 0 } of letters) {
      const word = section.words[w];
      if (word === undefined) {
        throw new Error(`${rule.id}: names word ${w}, which this section does not have.`);
      }

      // Find the nth occurrence. Anything less is the bug this exists to stop:
      // مِنكُم has two meems and lighting the wrong one would teach the wrong
      // rule, silently and convincingly.
      let idx = -1;
      for (let k = 0; k <= nth; k++) {
        idx = word.indexOf(t, idx + 1);
        if (idx < 0) {
          const count = word.split(t).length - 1;
          throw new Error(
            `${rule.id}: wanted occurrence ${nth} of ${JSON.stringify(t)} in word ${w} ` +
              `(${word}), but it occurs ${count} time(s). Check maidah95.letters.ts — ` +
              `mark order inside a word is not always what it looks like.`,
          );
        }
      }

      // indexOf counts UTF-16 units; the char ranges are in codepoints.
      const before = Array.from(word.slice(0, idx)).length;
      const len = Array.from(t).length;
      const [ws] = ranges[w];

      /**
       * Carry the rule's colour onto the marks of the letters it covers.
       *
       * A span names letters — "م" of مِّثْلُ — but the shadda and kasra riding
       * on that meem belong to it, and the mushaf colours them with it: the
       * whole مِّ is green for the idgham, not just the meem's body. Leaving
       * the marks lavender would look like a half-painted letter, and worse,
       * it would hide the very marks that TELL a reader the rule is there —
       * the shadda is the idgham.
       *
       * So extend forward over any combining marks that follow, stopping at
       * the next base letter or the end of the word. Marks only, never
       * letters: the alif of فَجَزَآءٌ takes its maddah, and stops before the
       * hamzah, which is a letter of its own.
       */
      const wordChars = Array.from(word);
      let end = before + len;
      while (end < wordChars.length && (CCC[wordChars[end].codePointAt(0)!] ?? 0) !== 0) {
        end++;
      }
      spans.push([ws + before, ws + end]);
    }
    return spans;
  }

  for (let w = rule.from; w <= rule.to; w++) spans.push(ranges[w]);
  return spans;
}

function bakeSection(section: Section): BakedSection {
  const text = section.words.join(" ");
  // Shape the HarfBuzz-ordered string, then carry every glyph back to the
  // characters of the real, canonical text through `perm`.
  const { shaped, perm } = reorderMarks(text);
  const run = font.layout(shaped, undefined, "arab", "ARA", "rtl");
  const charOf = mapGlyphsToChars(run, shaped).map((list) => list.map((i) => perm[i]));
  const ranges = wordRanges(section.words);

  const wordOfChar = (ci: number) => {
    for (let i = 0; i < ranges.length; i++) {
      if (ci >= ranges[i][0] && ci < ranges[i][1]) return i;
    }
    return -1; // a space
  };

  // Built with inline path data; deduplicated into `outlines` at the end.
  const glyphs: Array<Omit<BakedGlyph, "o"> & { d: string }> = [];
  /** Per-glyph outline bounds, parallel to `glyphs`: [minX, maxX, minY, maxY]. */
  const bboxOf: Array<[number, number, number, number]> = [];
  /** Original-text character indices each emitted glyph owns, parallel to `glyphs`. */
  const glyphChars: number[][] = [];
  const wordGlyphs: number[][] = section.words.map(() => []);
  let pen = 0;
  let top = -Infinity;
  let bottom = Infinity;

  for (let i = 0; i < run.glyphs.length; i++) {
    const g = run.glyphs[i];
    const p = run.positions[i];
    const owns = charOf[i];
    const isMark = p.xAdvance === 0;

    // A glyph belongs to the word holding any character it owns. Marks land
    // on the letter they decorate, so the first owned character is enough.
    let w = -1;
    for (const ci of owns) {
      w = wordOfChar(ci);
      if (w >= 0) break;
    }

    // A .notdef means the font has no glyph for that character, and because
    // .notdef carries no outline the old code simply dropped it — the letter
    // vanished from the render and nothing said so. That is how فَجَزَآءٌ came
    // to be missing its alif: the text used U+0622 (ALEF WITH MADDA ABOVE),
    // which this font does not have, where Uthmani orthography wants the
    // decomposed U+0627 + U+0653. Fail loudly instead.
    if (g.id === 0 || g.name === ".notdef") {
      const cps = g.codePoints
        .map((c: number) => "U+" + c.toString(16).toUpperCase().padStart(4, "0"))
        .join(", ");
      throw new Error(
        `${section.id}: the font has no glyph for ${cps} (in "${text}"). The text would ` +
          `render with a missing letter. Use the decomposed Uthmani form instead.`,
      );
    }

    const hasPath = g.path && g.path.commands && g.path.commands.length > 0;
    if (hasPath && w >= 0) {
      const x = pen + (p.xOffset ?? 0);
      const y = p.yOffset ?? 0;
      const bb = g.path.bbox;
      if (Number.isFinite(bb?.maxY)) top = Math.max(top, y + bb.maxY);
      if (Number.isFinite(bb?.minY)) bottom = Math.min(bottom, y + bb.minY);

      wordGlyphs[w].push(glyphs.length);
      bboxOf.push([bb?.minX ?? 0, bb?.maxX ?? 0, bb?.minY ?? 0, bb?.maxY ?? 0]);
      glyphChars.push(owns);
      glyphs.push({ d: g.path.toSVG(), x, y, w, mark: isMark });
    }
    pen += p.xAdvance;
  }

  /**
   * Every vowel sharing a base with a shadda must sit ABOVE it.
   *
   * This is the check that would have caught the bug this file shipped once:
   * a fatha resting ON the shadda at the same height instead of stacked over
   * it. It is cheap, it is exact, and it fails loudly the moment the mark
   * reordering stops working — which is far better than finding out from
   * someone reading the page.
   */
  {
    const glyphOfChar = new Map<number, number>();
    for (let gi = 0; gi < glyphs.length; gi++) {
      for (const ci of glyphChars[gi]) if (!glyphOfChar.has(ci)) glyphOfChar.set(ci, gi);
    }
    const chars = Array.from(text);
    let i = 0;
    while (i < chars.length) {
      if ((CCC[chars[i].codePointAt(0)!] ?? 0) === 0) {
        i++;
        continue;
      }
      let j = i;
      while (j < chars.length && (CCC[chars[j].codePointAt(0)!] ?? 0) !== 0) j++;
      // Only the vowels DRAWN ABOVE the letter have to clear the shadda.
      // Kasra and kasratan hang below it and never collide, so including them
      // would fail on مِّ, where the kasra correctly sits under the meem.
      const ABOVE = new Set([0x064b, 0x064c, 0x064e, 0x064f]);
      let shadda = -1;
      const vowels: number[] = [];
      for (let k = i; k < j; k++) {
        const cp = chars[k].codePointAt(0)!;
        if (cp === 0x0651) shadda = k;
        else if (ABOVE.has(cp)) vowels.push(k);
      }
      if (shadda >= 0 && vowels.length) {
        const sg = glyphOfChar.get(shadda);
        const sy = sg === undefined ? 0 : glyphs[sg].y;
        for (const v of vowels) {
          const vg = glyphOfChar.get(v);
          if (vg === undefined) continue;
          const vy = glyphs[vg].y;
          if (vy <= sy) {
            throw new Error(
              `${section.id}: in "${chars.slice(Math.max(0, i - 2), j).join("")}" the vowel ` +
                `U+${chars[v].codePointAt(0)!.toString(16).toUpperCase()} sits at y=${vy}, ` +
                `at or below its shadda at y=${sy}. Mark-to-mark attachment did not apply — ` +
                `check reorderMarks(). They must stack, not overlap.`,
            );
          }
        }
      }
      i = j;
    }
  }

  const words: BakedWord[] = section.words.map((text, i) => {
    const gs = wordGlyphs[i];
    const bases = gs.filter((gi) => !glyphs[gi].mark);
    // Extent comes from the OUTLINE, not the pen position: a glyph's ink can
    // start left of its origin and overhang its advance, and the ball has to
    // land over the ink a reader sees rather than over an advance box.
    const extent = (list: number[]) => {
      let x0 = Infinity;
      let x1 = -Infinity;
      for (const gi of list) {
        const gl = glyphs[gi];
        x0 = Math.min(x0, gl.x + (bboxOf[gi]?.[0] ?? 0));
        x1 = Math.max(x1, gl.x + (bboxOf[gi]?.[1] ?? 0));
      }
      return [x0, x1] as const;
    };
    const [bx0, bx1] = extent(bases.length ? bases : gs);
    // The ball lands on the highest INK in the word, marks included — a word
    // whose tashkeel rides high should push the ball up, or the bounce reads
    // as passing through the letters rather than off them.
    let wTop = -Infinity;
    for (const gi of gs) wTop = Math.max(wTop, glyphs[gi].y + (bboxOf[gi]?.[3] ?? 0));
    return { i, text, g: gs, x0: bx0, x1: bx1, top: wTop };
  });

  const rules: BakedRule[] = section.rules.map((rule) => {
    const spans = ruleCharSpans(rule, section, ranges);
    const covered = new Set<number>();
    // Walk the ORIGINAL run indices, keeping a parallel counter into `glyphs`:
    // the two differ because glyphs without outlines (the space) are dropped.
    let gi = 0;
    for (let i = 0; i < run.glyphs.length; i++) {
      const g = run.glyphs[i];
      const hasPath = g.path && g.path.commands && g.path.commands.length > 0;
      const owns = charOf[i];
      const w = owns.map(wordOfChar).find((x) => x >= 0) ?? -1;
      if (!hasPath || w < 0) continue;
      const hit = owns.some((ci) => spans.some(([s, e]) => ci >= s && ci < e));
      if (hit) covered.add(gi);
      gi++;
    }
    const list = [...covered].sort((a, b) => a - b);
    if (!list.length) throw new Error(`${rule.id}: matched no glyphs.`);
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const g of list) {
      x0 = Math.min(x0, glyphs[g].x + (bboxOf[g]?.[0] ?? 0));
      x1 = Math.max(x1, glyphs[g].x + (bboxOf[g]?.[1] ?? 0));
    }
    return { id: rule.id, g: list, x0, x1, w: rule.from };
  });

  return { id: section.id, text, width: pen, top, bottom, glyphs, words, rules };
}

/* ── run ─────────────────────────────────────────────────────────────────── */

assertPatchedFont();

/**
 * Every id in the letters file must name a rule that exists. Renaming a rule
 * — as `s1-munfasil` became `s1-muttasil` — would otherwise leave its letter
 * span orphaned, and the rule would quietly fall back to lighting its whole
 * word. Silent, plausible, and wrong: exactly what must not happen here.
 */
{
  const ids = new Set(MAIDAH_95.flatMap((s) => s.rules.map((r) => r.id)));
  const orphans = Object.keys(LETTERS).filter((id) => !ids.has(id));
  if (orphans.length) {
    throw new Error(
      `maidah95.letters.ts names ${orphans.length} rule(s) that do not exist: ` +
        `${orphans.join(", ")}.`,
    );
  }
}

/**
 * Round every coordinate in a path to a whole font unit.
 *
 * fontkit emits half-units ("208.5"). One unit is 1/2048 em — at the largest
 * size the hero ever draws (about 156px/em) that is 0.08px, below anything a
 * screen can show — so the decimals are pure weight.
 */
const roundPath = (d: string) => d.replace(/-?\d*\.\d+/g, (n) => String(Math.round(Number(n))));

const outlines: string[] = [];
const outlineIndex = new Map<string, number>();
const sections = MAIDAH_95.map(bakeSection).map((sec) => ({
  ...sec,
  glyphs: sec.glyphs.map(({ d, ...rest }) => {
    const r = roundPath(d);
    let o = outlineIndex.get(r);
    if (o === undefined) {
      o = outlines.length;
      outlines.push(r);
      outlineIndex.set(r, o);
    }
    return { o, ...rest, x: Math.round(rest.x), y: Math.round(rest.y) };
  }),
}));

const baked = {
  font: "uthmanic_hafs_v22 (patched)",
  unitsPerEm: font.unitsPerEm as number,
  outlines,
  sections,
};

writeFileSync(OUT, JSON.stringify(baked));

const glyphCount = baked.sections.reduce((n, s) => n + s.glyphs.length, 0);
const ruleCount = baked.sections.reduce((n, s) => n + s.rules.length, 0);
console.log(
  `baked ${baked.sections.length} sections, ${glyphCount} glyphs, ${ruleCount} rules ` +
    `-> ${OUT} (${(JSON.stringify(baked).length / 1024).toFixed(0)} KB)`,
);
for (const s of baked.sections) {
  console.log(
    `  ${s.id.padEnd(3)} ${String(s.words.length).padStart(2)} words  ` +
      `${String(s.glyphs.length).padStart(3)} glyphs  ${String(s.rules.length).padStart(2)} rules  ` +
      `width ${(s.width / baked.unitsPerEm).toFixed(2)}em`,
  );
}

const narrowed = MAIDAH_95.flatMap((s) => s.rules).filter((r) => LETTERS[r.id]);
const wide = MAIDAH_95.flatMap((s) => s.rules).filter((r) => !LETTERS[r.id]);
console.log(`\n${narrowed.length}/${ruleCount} rules narrowed to letters.`);
if (wide.length) {
  console.log(`still lighting whole words: ${wide.map((r) => r.id).join(", ")}`);
}
// A narrowed rule covering most of its word usually means the span missed and
// matched something broad — worth seeing rather than discovering on screen.
for (const sec of baked.sections) {
  for (const r of sec.rules) {
    if (!LETTERS[r.id]) continue;
    const wordGlyphs = new Set(sec.words.filter((w) => w.i === r.w).flatMap((w) => w.g));
    const share = wordGlyphs.size ? r.g.filter((g) => wordGlyphs.has(g)).length / wordGlyphs.size : 0;
    if (share > 0.6) {
      console.log(
        `  ⚠ ${r.id} lights ${(share * 100).toFixed(0)}% of its word — check the span`,
      );
    }
  }
}
