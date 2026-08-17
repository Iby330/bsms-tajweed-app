"use client";

import { Fragment } from "react";
import { isCenteredLine, wordKey, type MushafLine, type MushafPage, type QuranWord } from "@/lib/quran/mushaf";
import { surahHeaderGlyph } from "@/lib/quran/surah-header";
import { cn } from "@/lib/utils";

export type WordMark = { category: string };
export type SurahNames = Record<number, { ar: string; en: string }>;

const BASMALA = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ";

const pageFont = (page: number) => `QCF_P${String(page).padStart(3, "0")}`;

/** Juz labels for the seeded range (pages 562–604 = juz 29–30); the print's
 *  running head spells them out. */
const juzLabel = (page: number): string | null =>
  page >= 582 && page <= 604 ? "الجزء الثلاثون"
  : page >= 562 ? "الجزء التاسع والعشرون"
  : null;

/** A surah opens at this line when its first word sits on it — where the
 *  printed page carries the ornamental name band and the basmala. */
const surahStart = (ln: MushafLine): QuranWord | null => {
  const w = ln.words[0];
  return w && w.ayah === 1 && w.position === 1 ? w : null;
};

/**
 * The mushaf, one printed line per row. When every word carries a QCF v1
 * glyph (seeded from the 1405 Madani mushaf), each line renders in that
 * page's own King Fahd Complex font — the same letterforms, the same line,
 * ayah rosettes included, as the printed page; a page carries every surah
 * that appears on it, each opening with its name band and the basmala.
 * Words stay individually tappable. Without glyphs it falls back to
 * justified Uthmanic Hafs text.
 */
export function MushafReader({
  pages,
  marks = {},
  heat = {},
  surahNames,
  onWordTap,
}: {
  pages: MushafPage[];
  marks?: Record<string, WordMark>;   // wordKey → logged mistake (uniform tint)
  heat?: Record<string, string>;      // wordKey → precomputed tint class
  surahNames?: SurahNames;            // enables the name band at surah starts
  onWordTap?: (word: QuranWord) => void;
}) {
  const glyphMode = pages.every((p) =>
    p.lines.every((ln) => ln.words.every((w) => w.glyph)),
  );
  const last = pages[pages.length - 1]?.lines.at(-1);

  const renderWord = (word: QuranWord, text: string) => {
    const key = wordKey(word);
    if (word.isEnd) {
      // Glyph rosettes carry their number; the Hafs face draws a bare
      // numeral as the enclosed rosette too. Never tappable.
      return (
        <Fragment key={key}>
          <span className="text-ink-2">{text}</span>{" "}
        </Fragment>
      );
    }
    if (!onWordTap) {
      return (
        <Fragment key={key}>
          <span className={cn("rounded-md", marks[key] && "bg-danger/25", heat[key])}>
            {text}
          </span>{" "}
        </Fragment>
      );
    }
    return (
      <Fragment key={key}>
        <button
          type="button"
          onClick={() => onWordTap(word)}
          className={cn(
            "rounded-md transition-colors hover:bg-muted",
            marks[key] && "bg-danger/25",
            heat[key],
          )}
        >
          {text}
        </button>{" "}
      </Fragment>
    );
  };

  return (
    <div className="space-y-4">
      {glyphMode && (
        <style>
          {pages
            .map(
              (p) =>
                `@font-face{font-family:"${pageFont(p.page)}";src:url("/fonts/qcf/${pageFont(p.page)}.woff2") format("woff2");font-display:block;}`,
            )
            .join("\n")}
        </style>
      )}
      {pages.map((p) => {
        const opening = p.lines[0]?.words[0];
        const headName = opening ? surahNames?.[opening.surah] : undefined;
        const juz = juzLabel(p.page);
        return (
        <section key={p.page} className={cn(glyphMode ? "mushaf-page" : "glass rounded-2xl px-5 py-6")}>
          {glyphMode && (headName || juz) && (
            <div className="mushaf-running-head" dir="rtl" lang="ar">
              <span className="ar-ui">{headName ? `سُورَةُ ${headName.ar}` : ""}</span>
              <span className="ar-ui">{juz ?? ""}</span>
            </div>
          )}
          <div className={cn(glyphMode ? "mushaf-body" : "mx-auto max-w-xl")}>
            <div className={cn(!glyphMode && "space-y-0.5")}>
              {p.lines.map((ln) => {
                const opener = surahStart(ln);
                const cartouche = opener && glyphMode ? surahHeaderGlyph(opener.surah) : null;
                const name = opener ? surahNames?.[opener.surah] : undefined;
                return (
                  // line number + first word: two surahs can't collide even
                  // if upstream page data ever mis-files a boundary again
                  <Fragment key={`${ln.line}:${ln.words[0] ? wordKey(ln.words[0]) : "empty"}`}>
                    {opener && cartouche ? (
                      // The printed header: the whole ornamental cartouche —
                      // frame and calligraphic name — is one glyph.
                      <div dir="rtl" lang="ar" className="surah-cartouche" aria-label={name?.en}>
                        {cartouche}
                      </div>
                    ) : (
                      opener && name && (
                        <div className="my-2 rounded-lg border-y-2 border-line/80 bg-muted/40 px-3 py-1.5 text-center">
                          <span dir="rtl" lang="ar" className="ar-quran text-lg">
                            سُورَةُ {name.ar}
                          </span>
                          <span className="ml-3 align-middle text-[11px] uppercase tracking-wide text-muted-foreground">
                            {name.en}
                          </span>
                        </div>
                      )
                    )}
                    {opener && glyphMode ? (
                      // The print's own basmala calligraphy, vector-traced.
                      <div className="basmala-print" role="img" aria-label={BASMALA} />
                    ) : (
                      opener && (
                        <p dir="rtl" lang="ar" className="ar-mushaf centered mb-1 text-ink-2">
                          {BASMALA}
                        </p>
                      )
                    )}
                    <div
                      dir="rtl"
                      lang="ar"
                      className={cn(
                        glyphMode ? "qcf-line" : "ar-mushaf",
                        glyphMode && isCenteredLine(p.page, ln.line) && "centered",
                        !glyphMode && ln === last && ln.words.length < 6 && "centered",
                      )}
                      style={glyphMode ? { fontFamily: `"${pageFont(p.page)}"` } : undefined}
                    >
                      {ln.words.map((word) =>
                        renderWord(word, glyphMode ? word.glyph! : word.text),
                      )}
                    </div>
                  </Fragment>
                );
              })}
            </div>
            <p className="mt-3 text-center text-[11px] tabular-nums text-muted-foreground">
              {p.page}
            </p>
          </div>
        </section>
        );
      })}
    </div>
  );
}
