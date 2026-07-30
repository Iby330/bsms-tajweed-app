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
  const runs = splitRuns(text);
  const arClass = variant === "quran" ? "ar-quran" : "ar-ui";
  return (
    <span className={className}>
      {runs.map((run, i) =>
        run.ar ? (
          <span key={i} dir="rtl" lang="ar" className={arClass}>
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
}
