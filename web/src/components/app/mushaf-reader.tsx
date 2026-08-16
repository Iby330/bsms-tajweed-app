"use client";

import { Fragment } from "react";
import { wordKey, type MushafPage, type QuranWord } from "@/lib/quran/mushaf";
import { cn } from "@/lib/utils";

export type WordMark = { category: string };

const BASMALA = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ";

/**
 * The mushaf, one printed line per row, set in the KFGQPC Hafs face. Lines
 * are real justified text — words are inline buttons separated by spaces, so
 * the browser stretches the gaps to both margins the way the printed page
 * does. Ayah ends render as ۝ + numeral, which the font composes into the
 * enclosed rosette. Presentational only — logging and heat views drive it.
 */
export function MushafReader({
  pages,
  marks = {},
  heat = {},
  onWordTap,
}: {
  pages: MushafPage[];
  marks?: Record<string, WordMark>;   // wordKey → logged mistake (uniform tint)
  heat?: Record<string, string>;      // wordKey → precomputed tint class
  onWordTap?: (word: QuranWord) => void;
}) {
  const first = pages[0]?.lines[0]?.words[0];
  // Every surah in the seeded range (67–114) opens with the basmala; surah 1
  // is the only mushaf case where it is itself ayah 1, and it isn't seeded.
  const basmala = first && first.ayah === 1 && first.position === 1;
  const last = pages[pages.length - 1]?.lines.at(-1);

  return (
    <div className="space-y-4">
      {pages.map((p, pi) => (
        <section key={p.page} className="glass rounded-2xl px-5 py-6">
          <div className="mx-auto max-w-xl">
            {pi === 0 && basmala && (
              <p dir="rtl" lang="ar" className="ar-mushaf centered mb-1 text-ink-2">
                {BASMALA}
              </p>
            )}
            <div className="space-y-0.5">
              {p.lines.map((ln) => (
                <div
                  key={ln.line}
                  dir="rtl"
                  lang="ar"
                  className={cn(
                    "ar-mushaf",
                    // the closing line of the render centres, as in print
                    ln === last && ln.words.length < 6 && "centered",
                  )}
                >
                  {ln.words.map((word) => {
                    const key = wordKey(word);
                    if (word.isEnd) {
                      return (
                        <Fragment key={key}>
                          <span className="text-ink-2">{"۝" + word.text}</span>{" "}
                        </Fragment>
                      );
                    }
                    if (!onWordTap) {
                      return (
                        <Fragment key={key}>
                          <span className={cn("rounded-md", marks[key] && "bg-danger/25", heat[key])}>
                            {word.text}
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
                          {word.text}
                        </button>{" "}
                      </Fragment>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-[11px] tabular-nums text-muted-foreground">
              {p.page}
            </p>
          </div>
        </section>
      ))}
    </div>
  );
}
