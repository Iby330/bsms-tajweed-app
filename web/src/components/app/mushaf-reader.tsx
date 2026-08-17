"use client";

import { Fragment } from "react";
import {
  isCenteredLine, pageSlots, wordKey,
  type MushafLine, type MushafPage, type QuranWord,
} from "@/lib/quran/mushaf";
import { cn } from "@/lib/utils";

export type WordMark = { category: string };
export type SurahNames = Record<number, { ar: string; en: string }>;

const BASMALA = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ";

// the 1405H print's per-page fonts (QCF v1)
const pageFont = (page: number) => `QCF_P${String(page).padStart(3, "0")}`;

/** A surah opens at this line when its first word sits on it. */
const surahStart = (ln: MushafLine): QuranWord | null => {
  const w = ln.words[0];
  return w && w.ayah === 1 && w.position === 1 ? w : null;
};

/**
 * The mushaf, one printed page of EXACTLY 15 line slots — word lines plus
 * the header/basmala lines the print reserves (pageSlots reconstructs
 * them, including a header whose surah begins on the next page). Words
 * render as the page font's glyphs, individually tappable. Without glyphs
 * the reader falls back to justified Uthmanic Hafs text.
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
    <div className={cn(glyphMode ? "mushaf-spread" : "space-y-4")}>
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
      {pages.map((p) => (
        <section key={p.page} className={cn(glyphMode ? "mushaf-page" : "glass rounded-2xl px-5 py-6")}>
          {glyphMode ? (
            <div className="mushaf-frame">
              <div className="mushaf-body">
                {pageSlots(p).map((slot, i) => {
                  if (slot.type === "header") {
                    const name = surahNames?.[slot.surah];
                    return (
                      <div key={`slot-${i}`} className="mushaf-slot">
                        <div className="mushaf-header" aria-label={name?.en}>
                          <span className="band" aria-hidden>header</span>
                          <span className="name">{`surah${String(slot.surah).padStart(3, "0")}`}</span>
                        </div>
                      </div>
                    );
                  }
                  if (slot.type === "basmala") {
                    return (
                      <div key={`slot-${i}`} className="mushaf-slot">
                        <div className="bismillah" role="img" aria-label={BASMALA}>﷽</div>
                      </div>
                    );
                  }
                  const ln = slot.line;
                  return (
                    <div key={`slot-${i}`} className="mushaf-slot">
                      <div
                        dir="rtl"
                        lang="ar"
                        className={cn("qcf-line", isCenteredLine(p.page, ln.line) && "centered")}
                        style={{ fontFamily: `"${pageFont(p.page)}"` }}
                      >
                        {ln.words.map((word) => renderWord(word, word.glyph!))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-xl">
              {p.lines.map((ln) => {
                const opener = surahStart(ln);
                const name = opener ? surahNames?.[opener.surah] : undefined;
                return (
                  <Fragment key={`${ln.line}:${ln.words[0] ? wordKey(ln.words[0]) : "empty"}`}>
                    {opener && name && (
                      <div className="my-2 rounded-lg border-y-2 border-line/80 bg-muted/40 px-3 py-1.5 text-center">
                        <span dir="rtl" lang="ar" className="ar-quran text-lg">
                          سُورَةُ {name.ar}
                        </span>
                        <span className="ml-3 align-middle text-[11px] uppercase tracking-wide text-muted-foreground">
                          {name.en}
                        </span>
                      </div>
                    )}
                    {opener && (
                      <p dir="rtl" lang="ar" className="ar-mushaf centered mb-1 text-ink-2">
                        {BASMALA}
                      </p>
                    )}
                    <div
                      dir="rtl"
                      lang="ar"
                      className={cn(
                        "ar-mushaf",
                        ln === last && ln.words.length < 6 && "centered",
                      )}
                    >
                      {ln.words.map((word) => renderWord(word, word.text))}
                    </div>
                  </Fragment>
                );
              })}
              <p className="mt-3 text-center text-[11px] tabular-nums text-muted-foreground">
                {p.page}
              </p>
            </div>
          )}
          {glyphMode && <p className="mushaf-pageno">{p.page}</p>}
        </section>
      ))}
    </div>
  );
}
