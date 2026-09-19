import React from "react";

/**
 * MixedText — renders strings that interleave Arabic and Latin text.
 *
 * Every homework question, option, and student answer flows through this
 * component. Question prompts carry inline Qur'anic verses (the Forms export
 * has zero images — all verses are inline text), and student answers arrive
 * in Arabic script, transliteration, English, or a mix.
 *
 * Arabic runs render RTL with `unicode-bidi: isolate` so surrounding Latin
 * punctuation never reorders. Whitespace between two Arabic runs stays inside
 * the Arabic run (a verse with spaces is ONE run); harakat, tatweel, and
 * Arabic punctuation are all inside the matched ranges.
 */

// Arabic, Arabic Supplement, Arabic Extended-A, Presentation Forms A + B
const AR_CHAR =
  /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export type Run = { ar: boolean; text: string };

/** Split into alternating Arabic / non-Arabic runs. Exported for tests. */
export function splitRuns(text: string): Run[] {
  const runs: Run[] = [];
  let current: Run | null = null;
  let pendingWs = "";

  for (const ch of text) {
    if (/\s/.test(ch)) {
      // whitespace attaches to whichever run continues after it
      pendingWs += ch;
      continue;
    }
    const ar = AR_CHAR.test(ch);
    if (current && current.ar === ar) {
      current.text += pendingWs + ch;
    } else {
      // run boundary: trailing whitespace stays with the finished run
      if (current && pendingWs) current.text += pendingWs;
      else if (!current && pendingWs) runs.push({ ar: false, text: pendingWs });
      current = { ar, text: ch };
      runs.push(current);
    }
    pendingWs = "";
  }
  if (pendingWs) {
    if (current) current.text += pendingWs;
    else runs.push({ ar: false, text: pendingWs });
  }
  return runs;
}

export function MixedText({
  text,
  variant = "ui",
  className,
}: {
  text: string;
  /** "quran" for question prompts carrying verses; "ui" for answers/labels */
  variant?: "ui" | "quran";
  className?: string;
}) {
  const arClass = variant === "quran" ? "ar-quran" : "ar-ui";

  // Line breaks in the source are meaningful and HTML throws them away.
  // A question written as "What rule is involved in this ayah?\nوَجَنَّٰتٍ
  // أَلْفَافًا" is asking in English ABOUT the verse below it, and collapsing
  // the newline runs the two together as one line. Each line becomes its own
  // block, so the ayah sits under the question as it was written.
  //
  // Only when there IS more than one line: a title or a label is a single run
  // and must stay inline, or every one of them would start a new line.
  const lines = text.trim().split(/\n+/);
  const multi = lines.length > 1;

  return (
    <span className={className}>
      {lines.map((line, li) => {
        const runs = splitRuns(line);
        // An Arabic run sharing its line with English is being read INSIDE an
        // English sentence — "which rule applies to نْ here?" — and the eye
        // needs a beat either side of it to switch direction and switch back.
        // A line that is nothing but Arabic is a verse on its own line and
        // wants no such indent, so the spacing is asked for per line rather
        // than set on `.ar-quran` for every run in the app.
        const inlineMix = runs.some((r) => r.ar) && runs.some((r) => !r.ar && r.text.trim());

        return (
          <span key={li} className={multi ? "block" : undefined}>
            {runs.map((run, i) =>
              run.ar ? (
                <span
                  key={i}
                  dir="rtl"
                  lang="ar"
                  className={inlineMix ? `${arClass} ar-inline` : arClass}
                >
                  {run.text}
                </span>
              ) : (
                <span key={i} dir="ltr">
                  {run.text}
                </span>
              ),
            )}
          </span>
        );
      })}
    </span>
  );
}
