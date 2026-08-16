"use client";

import { wordKey, type MushafPage, type QuranWord } from "@/lib/quran/mushaf";
import { cn } from "@/lib/utils";

export type WordMark = { category: string };

/**
 * The mushaf, one printed line per row. Presentational only — logging and
 * heat views both drive it. Lines justify like the printed page; short lines
 * (surah endings) centre instead of stretching two words across the width.
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
  return (
    <div className="space-y-4">
      {pages.map((p) => (
        <section key={p.page} className="glass rounded-2xl px-4 py-5">
          <p className="mb-3 text-center text-[11px] tabular-nums text-muted-foreground">
            page {p.page}
          </p>
          <div className="space-y-1">
            {p.lines.map((ln) => (
              <div
                key={ln.line}
                dir="rtl"
                lang="ar"
                className={cn(
                  "ar-quran flex flex-wrap gap-y-1",
                  ln.words.length >= 5 ? "justify-between" : "justify-center gap-x-3",
                )}
              >
                {ln.words.map((word) => {
                  const key = wordKey(word);
                  if (word.isEnd) {
                    return (
                      <span key={key}
                        className="self-center rounded-full border border-line px-1.5 text-[0.55em] leading-6 text-muted-foreground">
                        {word.text}
                      </span>
                    );
                  }
                  if (!onWordTap) {
                    return (
                      <span key={key}
                        className={cn("rounded-md px-0.5", marks[key] && "bg-danger/25", heat[key])}>
                        {word.text}
                      </span>
                    );
                  }
                  return (
                    <button key={key} type="button" onClick={() => onWordTap(word)}
                      className={cn("rounded-md px-0.5 transition-colors hover:bg-muted",
                        marks[key] && "bg-danger/25", heat[key])}>
                      {word.text}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
