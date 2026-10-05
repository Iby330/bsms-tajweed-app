"use client";

import { tapLetterWords, type LetterOption } from "@/lib/homework/tap-letters";
import { arabicNumber } from "@/lib/homework/tap-words";
import { cn } from "@/lib/utils";

/**
 * A verse with every LETTER tappable — the answer sheet for "tap every heavy
 * letter". See lib/homework/tap-letters.ts for the shape underneath.
 *
 * Letters are spans, not buttons, and that is the point: a button is an
 * inline-block, which breaks the word apart into isolated letter forms. A span
 * inside the word keeps the Arabic joined, so the student taps the ص of
 * ٱلصِّرَٰطَ in the word as it is written. Each span is still a checkbox to a
 * keyboard and a screen reader (role, tabindex, Space/Enter).
 *
 * `reveal` is the marked view, as in TapWords: found, wrongly tapped, missed.
 */
export function TapLetters({
  options,
  selected,
  onChange,
  readOnly = false,
  reveal = false,
}: {
  options: LetterOption[];
  selected: number[];
  onChange?: (next: number[]) => void;
  readOnly?: boolean;
  reveal?: boolean;
}) {
  const chosen = new Set(selected);
  const words = tapLetterWords(options);

  const toggle = (position: number) => {
    if (readOnly || !onChange) return;
    onChange(chosen.has(position) ? selected.filter((p) => p !== position) : [...selected, position]);
  };

  return (
    <div className="space-y-3">
      <div dir="rtl" lang="ar" className="ar-tap tap-letters rounded-lg border border-line bg-page px-4 py-5">
        {words.map((w) => (
          <span key={`${w.surah}:${w.ayah}:${w.word}`}>
            <span className="whitespace-nowrap">
              {w.letters.map((l) => {
                const picked = chosen.has(l.position);
                const hit = reveal && picked && l.correct;
                const wrong = reveal && picked && !l.correct;
                const missed = reveal && !picked && l.correct;
                return (
                  <span
                    key={l.position}
                    role="checkbox"
                    aria-checked={picked}
                    aria-label={`letter ${l.value ?? ""}`}
                    aria-disabled={readOnly || undefined}
                    tabIndex={readOnly ? -1 : 0}
                    onClick={() => toggle(l.position)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        toggle(l.position);
                      }
                    }}
                    className={cn(
                      "rounded-sm outline-none transition-colors focus-visible:bg-brand/20",
                      !readOnly && "cursor-pointer",
                      !reveal && picked && "bg-ink/20 text-ink",
                      !reveal && !picked && !readOnly && "hover:bg-muted",
                      hit && "bg-ok/20 text-ok",
                      wrong && "bg-danger/20 text-danger",
                      missed && "bg-miss text-[#00004d]",
                    )}
                  >
                    {l.value}
                  </span>
                );
              })}
            </span>{" "}
            {w.endsAyah && (
              <>
                <span aria-label={`ayah ${w.ayah}`} className="text-ink-3">
                  ﴿{arabicNumber(w.ayah)}﴾
                </span>{" "}
              </>
            )}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {reveal ? (
          <>
            <span className="text-ok">Found</span> · <span className="text-danger">wrongly tapped</span> ·{" "}
            <span className="rounded-sm bg-miss px-1 text-[#00004d]">missed</span>
          </>
        ) : readOnly ? (
          `${selected.length} letter${selected.length === 1 ? "" : "s"} tapped.`
        ) : (
          `Tap a letter to select it, tap again to undo. ${selected.length} selected.`
        )}
      </p>
    </div>
  );
}
