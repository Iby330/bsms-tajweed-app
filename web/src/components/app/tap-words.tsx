"use client";

import { arabicNumber, tapAyahs, type TapOption } from "@/lib/homework/tap-words";
import { cn } from "@/lib/utils";

/**
 * A passage of Qur'an with every word tappable — the answer sheet for a
 * "find the rule" question.
 *
 * Each word is a real button, not a div with a click handler, so it is
 * reachable by keyboard and announced as pressed or not. The passage runs
 * right-to-left and wraps like prose; ayah numbers sit inline in Arabic-Indic
 * digits the way the mushaf prints them, so the page reads as Qur'an rather
 * than as a form.
 *
 * `reveal` turns it into the marked view: it needs each option's `correct`
 * flag, which the teacher's screens have and the student RPC deliberately
 * strips — so a student sees only their own taps, and a teacher sees those
 * against the key.
 */
export function TapWords({
  options,
  selected,
  onChange,
  readOnly = false,
  reveal = false,
}: {
  options: TapOption[];
  /** Option positions the student has tapped. */
  selected: number[];
  onChange?: (next: number[]) => void;
  readOnly?: boolean;
  /** Draw the answer key against the taps. Teacher-side only. */
  reveal?: boolean;
}) {
  const chosen = new Set(selected);
  const ayahs = tapAyahs(options);

  const toggle = (position: number) => {
    if (readOnly || !onChange) return;
    onChange(
      chosen.has(position)
        ? selected.filter((p) => p !== position)
        : [...selected, position],
    );
  };

  return (
    <div className="space-y-3">
      <div
        dir="rtl"
        lang="ar"
        className="ar-tap rounded-lg border border-line bg-page px-4 py-5"
      >
        {ayahs.map((a) => (
          <span key={`${a.surah}:${a.ayah}`}>
            {a.words.map((w) => {
              const picked = chosen.has(w.position);
              // Four states once revealed: found it, wrongly picked, missed,
              // and correctly left alone (which needs no mark at all).
              const hit = reveal && picked && w.correct;
              const wrong = reveal && picked && !w.correct;
              const missed = reveal && !picked && w.correct;

              return (
                <button
                  key={w.position}
                  type="button"
                  disabled={readOnly}
                  aria-pressed={picked}
                  aria-label={w.value ?? w.label}
                  onClick={() => toggle(w.position)}
                  className={cn(
                    "mx-[0.12em] rounded-md px-[0.2em] py-[0.05em] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    // A tint and a ring rather than a solid fill: the word has
                    // to stay READABLE while selected, and a filled chip means
                    // relying on a text colour to sit on top of it — which is
                    // how a tapped word became a blank block.
                    !reveal && picked && "bg-ink/15 ring-1 ring-ink/50",
                    !reveal && !picked && !readOnly && "hover:bg-muted",
                    hit && "bg-ok/15 text-ok ring-1 ring-ok/50",
                    wrong && "bg-danger/15 text-danger ring-1 ring-danger/50",
                    missed && "bg-warn/10 text-warn ring-1 ring-warn/40",
                    readOnly && "cursor-default",
                  )}
                >
                  {w.value ?? w.label}
                </button>
              );
            })}
            <span aria-label={`ayah ${a.ayah}`} className="mx-[0.2em] text-ink-3">
              ﴿{arabicNumber(a.ayah)}﴾
            </span>{" "}
          </span>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {reveal ? (
          <>
            <span className="text-ok">Found</span> ·{" "}
            <span className="text-danger">wrongly tapped</span> ·{" "}
            <span className="text-warn">missed</span>
          </>
        ) : readOnly ? (
          `${selected.length} word${selected.length === 1 ? "" : "s"} tapped.`
        ) : (
          `Tap a word to select it, tap again to undo. ${selected.length} selected.`
        )}
      </p>
    </div>
  );
}
