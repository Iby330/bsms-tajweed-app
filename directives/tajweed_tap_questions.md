# Tap-the-rule homework questions

## Goal

Set a question that asks a student to FIND a tajweed rule in real Qur'anic text,
rather than define it. The student taps words in a passage set from the mushaf's
own glyphs; the answer key is derived from a sourced annotation set, so nobody
hand-types which words are correct.

Built once for a spike (An-Naba' 12–18, ikhfā', on TFP 7). Kept because the
homework refresh will want many of these, and every part of it generalises: give
the rule, the passage, the wording and the marks, and the question builds itself.

## Inputs

What a teacher actually decides:

| Input | Flag | Notes |
| --- | --- | --- |
| Rule to spot | `--rule` | one of the 18 below |
| Passage | `--surah --from --to` | must be inside the seeded range, surahs 67–114 |
| Homework | `--homework` | the homework NUMBER, not its id |
| Question text | `--prompt` | omit and a serviceable one is generated |
| Marks | `--points` | shared across the correct words |
| Position | `--position` | defaults to 99, i.e. last, so real questions never renumber |

Rules available: `ikhfa`, `ikhfa_shafawi`, `idghaam_ghunnah`,
`idghaam_no_ghunnah`, `idghaam_shafawi`, `idghaam_mutajaanisain`,
`idghaam_mutaqaaribain`, `iqlab`, `ghunnah`, `qalqalah`, `madd_2`, `madd_246`,
`madd_muttasil`, `madd_munfasil`, `madd_6`, `hamzat_wasl`, `lam_shamsiyyah`,
`silent`.

They map onto the year almost one-to-one: Term 1 is the noon-sākin family
(`ikhfa`, `idghaam_*`, `iqlab`, `ghunnah`), Term 2 takes in `qalqalah`, Term 3
the `madd_*` set.

## Tools

`execution/tajweed_tap_question.ts` — run it from `web/`:

```sh
cd web
npx tsx ../execution/tajweed_tap_question.ts --help
npx tsx ../execution/tajweed_tap_question.ts --rule qalqalah --surah 80 --from 1 --to 10
npx tsx ../execution/tajweed_tap_question.ts --rule ikhfa --homework 6 --points 6 --commit
npx tsx ../execution/tajweed_tap_question.ts --homework 107 --position 99 --delete
```

Always dry-run first. It prints the passage with the key marked in brackets, so
the wording and the key can both be read before anything is written.

## Outputs

One row in `questions`, shaped so that nothing else in the app had to change:

- `qtype` is `checkbox` and `scoring` is `per_option`, so the existing marking
  path scores it — each correct word earns a share, wrong picks cancel, floored
  at zero. Tapping every word scores nothing.
- `options` is one entry per word of the passage. `label` is
  `surah:ayah:position:page`; `value` is the printed glyph and the readable text,
  tab-separated; `correct` marks the words the rule touches.
- The app recognises the shape through `isTapWords()` in
  `web/src/lib/homework/tap-words.ts` and draws it with `TapWords`.

## How the key is derived

Annotations come from [cpfair/quran-tajweed](https://github.com/cpfair/quran-tajweed)
(CC-BY 4.0, generated from the Tanzil Uthmani text), cached in the temp dir on
first run. Each is a rule name and a range of Unicode CODEPOINT offsets within
one ayah. Our own `quran_words.text_uthmani` came from quran.com — the same
Uthmani text, word by word — so joining our words with single spaces reproduces
Tanzil's string and the offsets land where they should.

That equality is the whole method, so it is checked rather than assumed: the
script rebuilds each ayah from our words and **aborts** if any annotation reaches
past the end. If that ever fires, the two texts have drifted and the key is not
to be trusted.

## Edge cases

- **A rule spans two words.** Ikhfā' is usually a tanwīn ending one word meeting
  a letter starting the next (`سَبْعًۭا شِدَادًۭا`). Both words are marked correct, and
  the generated prompt says so. A student should never be marked on a convention
  they were not told.
- **The first ayah of a surah** carries the basmala in Tanzil's text, shifting
  every offset in it by the basmala's length plus one. Handled; do not "fix" it.
- **Choose a passage with enough instances.** An-Naba' 12–18 gives 4 instances in
  29 words. One instance in thirty words is a hunt, not a question. The dry run
  prints the counts.
- **Attaching to a homework that has submissions changes its total marks**, which
  is the divisor in `v_hw_pct_all` — every released percentage on that homework
  moves, and the term averages and leaderboards with them. During the refresh
  this is fine because the marks are being rebuilt anyway; outside it, prefer a
  homework nobody has handed in.
- **Only surahs 67–114 are seeded** in `quran_words`. Outside that the script has
  no words and stops.
- **The `ۭ` marks are not a rule.** Across surah 78, 21 of the 40 words carrying
  U+06ED are touched by no ghunna-family rule at all. It is orthography, it gives
  no answer away, and stripping it would corrupt the text.

## Gotchas

- `tsx` runs `execution/*.ts` as CJS, so top-level `await` fails with *"not
  supported with the cjs output format"*. Wrap the run section in
  `async function main()` and call `main().catch(...)`, as the other scripts do.
- The passage is drawn with the mushaf's own page glyphs (`code_v1` +
  `/fonts/qcf/QCF_Pxxx.woff2`). Rendering the plain text instead leaves Arabic
  marks for the browser to position, and it puts small meems in the wrong place
  in every font tried. If a word has no glyph the script warns and falls back.
- A passage must not cross a mushaf page unless every page's font is bundled —
  they are, for 562–604, one file per page.
- `get_homework_for_student` passes a student only `position`, `label` and
  `value` from each option. Anything a question needs on screen has to be packed
  into those three, which is why the page rides in the label and the glyph rides
  in the value.

## Verifying

Dry run reads. For the rendering, drive a real browser — grepping the HTML will
tell you the markup is right while the page looks wrong:

```sh
# scratchpad harness: signs in, screenshots, can tap words first
node shot.mjs adam.w@bsms-demo.test '<password>' /homework/107 out.png '.ar-tap'
```
