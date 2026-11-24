/**
 * A question's ayah typeset from the mushaf data instead of a picture.
 *
 * Purely presentational — no "use client", no hooks — so the printed paper (a
 * server component) and the builder (client) render the same thing. The words
 * come from `loadQuranSnippets` on the server or `GET /api/exam-builder/quran`
 * in the browser.
 *
 * Set as the mushaf reader sets a page: one row per PRINTED line (except that
 * a short range on one page is set as a single line — `setLines`), each in its
 * page's QCF v1 font (`QCF_P###`), drawn from `code_v1` glyphs and closed by
 * the page font's own rosettes — so it is the school's mushaf, not a
 * re-typeset approximation. Lines are centred and never wrap (the print
 * already broke them); the type scales down to the box so a full mushaf line
 * fits the A4 measure, and is capped so a two-word phrase is not blown up.
 *
 * `size="option"` sets a multiple-choice option's words: one run at about
 * the size of the option text beside it (not scaled to the box), wrapping
 * between words if it must, so five options still sit in a row as their
 * pictures did.
 *
 * Part of an ayah (a phrase found in several places, often) is never named:
 * the accessible name says "Qur'an words", not a surah and ayah that could be
 * the wrong one, and its rosette shows only when the range reaches it.
 *
 * `basmala` sets the surah's basmala above the words exactly as the mushaf
 * reader sets its basmala slot (the `bismillah` font's ﷽, `.bismillah`): it
 * is not an ayah of the surah in quran_words. `circle` draws a thin
 * hand-drawn ellipse round one letter of one word (`CircleMark`), placed by
 * fractions of that word's box because a QCF word is a single glyph.
 *
 * If any word lacks a glyph the whole snippet flows as Uthmanic Hafs text
 * (`.ar-quran`, dagger alifs seated by fromRow) with ﴿n﴾ ayah numbers: glyphs
 * from one edition cannot be mixed with text from another word by word.
 */
import { preload } from "react-dom";
import { pageFont } from "@/lib/homework/tap-words";
import { BASMALA } from "@/lib/quran/mushaf";
import type { QuranCircle } from "@/lib/exam-builder/types";
import {
  hasAllGlyphs,
  isPartialRange,
  readableText,
  setLines,
  snippetLabel,
  snippetPages,
  type SnippetWord,
} from "@/lib/exam-builder/quran-lines";

type Variant = "screen" | "print";
type Size = "passage" | "option";

/** The cap: how big a short phrase may get. Tuned against the source
 *  documents' pictures (a one-line picture prints ≤22mm tall). */
const CAP: Record<Variant, string> = { print: "22pt", screen: "1.9em" };

/** An option's words: about the option text's own size (Arabic text there is 1.3em). */
const OPTION_SIZE: Record<Variant, string> = { print: "17pt", screen: "1.45em" };

const fontUrl = (page: number) => `/fonts/qcf/${pageFont(page)}.woff2`;

function label(words: SnippetWord[]): string {
  if (isPartialRange(words)) return "Qur'an words";
  const first = words[0];
  const last = words[words.length - 1];
  return snippetLabel({ surah: first.surah, from_ayah: first.ayah, to_ayah: last.ayah });
}

/** The source pictures' marker: a hand-drawn purple. Prints as a mid grey in black and white. */
const CIRCLE_INK = "#8a1f8f";

/**
 * A thin, slightly uneven ellipse over one word, as a teacher's pen drew it:
 * centred `x` of the word's width in from its right edge, `w` wide, the full
 * height of the line. Stroke only, vector, so it prints; aria-hidden (the
 * question's wording says what is circled).
 */
export function CircleMark({ x, w }: Pick<QuranCircle, "x" | "w">) {
  return (
    <svg
      aria-hidden="true"
      className="quran-circle"
      viewBox="0 0 40 100"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        // The line box is 1.75em; the ink, marks above and below included, is
        // about its middle two thirds. Tuned against the bank's own circles.
        top: "17%",
        height: "68%",
        right: `${((x - w / 2) * 100).toFixed(2)}%`,
        width: `${(w * 100).toFixed(2)}%`,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <path
        d="M22 3 C34 4 38 24 38 50 C38 76 33 97 20 97 C8 97 2 76 2 50 C2 26 7 6 19 3 C23 2 27 4 28 7"
        fill="none"
        stroke={CIRCLE_INK}
        strokeWidth="1.6"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** The word a circle sits on: its own inline box, so the circle can be placed against it. */
function Word({ w, circle, firstAyah }: { w: SnippetWord; circle?: QuranCircle; firstAyah: number }) {
  const circled = !!circle && !w.isEnd && w.ayah === firstAyah && w.position === circle.word;
  return (
    <span style={{ display: "inline-block", ...(circled ? { position: "relative" } : null) }}>
      {w.glyph}
      {circled ? <CircleMark x={circle.x} w={circle.w} /> : null}
    </span>
  );
}

/** The basmala above a surah, as the mushaf reader's basmala slot draws it. */
function Basmala({ fontSize }: { fontSize: string }) {
  return (
    <div aria-hidden="true" className="quran-snippet-basmala" style={{ fontSize }}>
      <div className="bismillah">﷽</div>
    </div>
  );
}

function FontFaces({ pages }: { pages: number[] }) {
  // Start the page fonts with the document rather than at first layout, so
  // they are in hand by the time the print toolbar waits on document.fonts.
  for (const page of pages) {
    preload(fontUrl(page), { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }
  return (
    <style>
      {pages
        .map(
          (page) =>
            `@font-face{font-family:"${pageFont(page)}";src:url("${fontUrl(page)}") format("woff2");font-display:block;}`,
        )
        .join("\n")}
    </style>
  );
}

export function QuranSnippet({
  words,
  variant,
  size = "passage",
  basmala = false,
  circle,
}: {
  words: SnippetWord[];
  variant: Variant;
  size?: Size;
  /** Set the surah's basmala above the words (the ref's `basmala`). */
  basmala?: boolean;
  /** Circle one letter (the ref's `circle`). */
  circle?: QuranCircle;
}) {
  if (words.length === 0) return null;
  const name = label(words);
  const readable = (basmala ? `${BASMALA} ` : "") + readableText(words);
  const firstAyah = words[0].ayah;

  if (size === "option") {
    if (!hasAllGlyphs(words)) {
      return (
        <span lang="ar" dir="rtl" aria-label={name} className="ar-quran quran-snippet quran-snippet--option" data-variant={variant}
          style={{ display: "inline-block", fontWeight: 400, lineHeight: 1.8 }}>
          {readable}
        </span>
      );
    }
    return (
      <span lang="ar" dir="rtl" role="img" aria-label={`${name}: ${readable}`} className="quran-snippet quran-snippet--option" data-variant={variant}
        style={{ display: "inline-block", maxWidth: "100%", fontWeight: 400, fontSize: OPTION_SIZE[variant], lineHeight: 1.8, color: "inherit", unicodeBidi: "isolate" }}>
        <FontFaces pages={snippetPages(words)} />
        {words.map((w) => (
          <span key={`${w.ayah}:${w.position}`} aria-hidden="true" style={{ fontFamily: `"${pageFont(w.page)}"` }}>
            <Word w={w} circle={circle} firstAyah={firstAyah} />
          </span>
        )).flatMap((el, i) => (i === 0 ? [el] : [" ", el]))}
      </span>
    );
  }

  if (!hasAllGlyphs(words)) {
    return (
      <p
        lang="ar"
        dir="rtl"
        aria-label={name}
        className="ar-quran quran-snippet quran-snippet--text"
        data-variant={variant}
        style={{
          margin: 0,
          fontWeight: 400,
          fontSize: variant === "print" ? "16pt" : "1.45em",
          lineHeight: 2,
          textAlign: "right",
        }}
      >
        {readable}
      </p>
    );
  }

  const pages = snippetPages(words);
  // A short range on one page is set as one line (setLines), not as the
  // mushaf's stub-then-rest.
  const lines = setLines(words);

  return (
    <figure
      lang="ar"
      dir="rtl"
      aria-label={name}
      className="quran-snippet"
      data-variant={variant}
      // A question is bold on the sheet; a page font has no bold, and a
      // synthesised one smears the marks.
      style={{ margin: 0, containerType: "inline-size", color: "inherit", fontWeight: 400 }}
    >
      <FontFaces pages={pages} />
      {basmala ? <Basmala fontSize={`min(${CAP[variant]}, calc(100cqi / ${lines[0]?.em ?? 16}))`} /> : null}
      {lines.map((ln) => (
        <div
          key={`${ln.page}:${ln.line}`}
          aria-hidden="true"
          className="quran-snippet-line"
          style={{
            fontFamily: `"${ln.font}"`,
            fontSize: `min(${CAP[variant]}, calc(100cqi / ${ln.em}))`,
            lineHeight: 1.75,
            whiteSpace: "nowrap",
            textAlign: "center",
            unicodeBidi: "isolate",
            breakInside: "avoid",
          }}
        >
          {ln.words.map((w) => (
            // Inline blocks, as the reader sets them: each glyph is an atomic
            // box, so the line runs right-to-left whatever bidi class a
            // private-use glyph codepoint happens to carry.
            <Word key={`${w.ayah}:${w.position}`} w={w} circle={circle} firstAyah={firstAyah} />
          )).flatMap((el, i) => (i === 0 ? [el] : [" ", el]))}
        </div>
      ))}
      {/* The glyphs are private-use codepoints a screen reader cannot say. */}
      <figcaption className="sr-only">{readable}</figcaption>
    </figure>
  );
}
