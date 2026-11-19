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
 * If any word lacks a glyph the whole snippet flows as Uthmanic Hafs text
 * (`.ar-quran`, dagger alifs seated by fromRow) with ﴿n﴾ ayah numbers: glyphs
 * from one edition cannot be mixed with text from another word by word.
 */
import { preload } from "react-dom";
import { arabicNumber, pageFont } from "@/lib/homework/tap-words";
import {
  flowingAyahs,
  hasAllGlyphs,
  setLines,
  snippetLabel,
  snippetPages,
  type SnippetWord,
} from "@/lib/exam-builder/quran-lines";

type Variant = "screen" | "print";

/** The cap: how big a short phrase may get. Tuned against the source
 *  documents' pictures (a one-line picture prints ≤22mm tall). */
const CAP: Record<Variant, string> = { print: "22pt", screen: "1.9em" };

const fontUrl = (page: number) => `/fonts/qcf/${pageFont(page)}.woff2`;

function label(words: SnippetWord[]): string {
  const first = words[0];
  const last = words[words.length - 1];
  return snippetLabel({ surah: first.surah, from_ayah: first.ayah, to_ayah: last.ayah });
}

export function QuranSnippet({ words, variant }: { words: SnippetWord[]; variant: Variant }) {
  if (words.length === 0) return null;
  const name = label(words);
  const plain = flowingAyahs(words);
  const readable = plain.map((a) => (a.ended ? `${a.text} ﴿${arabicNumber(a.ayah)}﴾` : a.text)).join(" ");

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
  // Start the page fonts with the document rather than at first layout, so
  // they are in hand by the time the print toolbar waits on document.fonts.
  for (const page of pages) {
    preload(fontUrl(page), { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }
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
      <style>
        {pages
          .map(
            (page) =>
              `@font-face{font-family:"${pageFont(page)}";src:url("${fontUrl(page)}") format("woff2");font-display:block;}`,
          )
          .join("\n")}
      </style>
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
            <span key={`${w.ayah}:${w.position}`} style={{ display: "inline-block" }}>
              {w.glyph}
            </span>
          )).flatMap((el, i) => (i === 0 ? [el] : [" ", el]))}
        </div>
      ))}
      {/* The glyphs are private-use codepoints a screen reader cannot say. */}
      <figcaption className="sr-only">{readable}</figcaption>
    </figure>
  );
}
