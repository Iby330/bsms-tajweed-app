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

Plus two rules the annotation set lacks, derived from the text by the script
itself: `idhaar_halqi` (nūn sākinah / tanwīn before ء ه ع ح غ خ) and
`idhaar_shafawi` (mīm sākinah before anything but م ب). cpfair only marks
rules that change a sound, so iẓhār is absent there. The derivation is
phonetic (next pronounced letter, inside the ayah, tanwīn's next sound is the
next word) and is cross-checked against the quran.com orthography, which shows
the sukūn / plain tanwīn exactly when the letter is pronounced clearly. A
mismatch prints a `warning`; the one known, correct case is ٱلدُّنْيَا-type
words (iẓhār muṭlaq — nūn and yā'/wāw in one word), which are iẓhār but not
ḥalqī. Verified against last year's keys: 106:4, 88:1–4, 97:1, 105:1–5.

Three more derived rules, also verified against last year's keys:
`heavy_letters` (the seven isti'lā' letters, letter-level), `lam_allah_heavy`
and `lam_allah_light` (the lām of the Name of Allah: heavy after fatḥah or
ḍammah or when starting on it, light after kasrah — 66:1, 69:33, 62:11,
112:1–2, 1:1–2; ٱللَّهْوِ is correctly excluded by its sākin hā').

`--json PATH` writes the passage as data: every word with its own key AND
its letters each with a key (for "tap the letters"). `--audio` adds Al-Ḥuṣarī's
murattal per surah from **QUL** (Tarteel's Quranic Universal Library —
`GET https://qul.tarteel.ai/api/v1/audio/surah_segments/6?surah=N&per_page=300`,
resource 316, internal recitation id 6, Ḥuṣarī murattal), cached per surah in
the temp dir, with `[word position, start ms, end ms]` segments inside the
surah's own audio file — the slice a "name the rule you heard" question
plays. QUL's *ayah-by-ayah* Ḥuṣarī sets (20–22) have broken timings (70–100 ms
words) — use the surah-segments set above, not those. The audio file itself
is hosted on `audio-cdn.tarteel.ai` (range requests OK, no CORS header — fine
for an `<audio>` tag, would fail a `fetch`). QUL's API 403s a request with no
(or Python's default) User-Agent header — send a real one when probing it
outside this script; the script's own `fetch` call works as-is.

Seeded text now covers surah 1 (page 1), surahs 46–66 (pages 502–561) and
67–114 (`seed_quran_words.ts --pages`). Al-Fātiḥah 1:1 carries no extra
basmala offset (handled; At-Tawbah likewise).

`madd_2` marks only the small dagger alif, not natural madd in general — don't
use it for "tap every natural madd".

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

**Source (since 2026-10-01): quran.com's tajweed markup** —
`GET https://api.quran.com/api/v4/quran/verses/uthmani_tajweed?chapter_number=N`,
cached per surah in the temp dir. It is quran.com's own Uthmani text with each
rule as an inline tag on the letters it covers (`<tajweed class=qalaqah>ق</tajweed>`),
i.e. the same text `quran_words` holds, so a rule is attached to a LETTER of our
words rather than to a codepoint offset. The markup's letters are aligned to ours
by LCS over letter classes; the only differences allowed are spelling variants
(hamza seat ا/أ/إ/آ/ء, ى/ي/ئ/ٮ, و/ؤ, and a long ā on ى vs on a tatweel).
LETTER_GUARD aborts on anything else. A full scan of every seeded surah (1,
46–114) aligns cleanly.

Class → rule: ham_wasl→hamzat_wasl, laam_shamsiyah→lam_shamsiyyah,
qalaqah→qalqalah, ghunnah, ikhafa→ikhfa, ikhafa_shafawi, iqlab,
idgham_ghunnah→idghaam_ghunnah, idgham_wo_ghunnah→idghaam_no_ghunnah,
idgham_shafawi, idgham_mutajanisayn/mutaqaribayn, madda_normal→madd_2,
madda_permissible→madd_246 = madd_arid (ʿāriḍ / līn at the stop),
madda_necessary→madd_6, slnt→silent. **madda_obligatory covers muttaṣil AND
munfaṣil** (both 4–5 in this ṭarīq) and is split by position: madd letter
ending its word with the hamza opening the next → munfaṣil; yā' an-nidā' /
hā' at-tanbīh at the start of a word (يَـٰٓأَيُّهَا, هَـٰٓؤُلَآءِ, 47:38) → munfaṣil, as
the course teaches; hamza later in the same word → muttaṣil. When checking
whether the madd ends its word and what follows it, silent letters (`slnt`)
are skipped — a written-but-unread alif between the madd and the next word's
hamza (ءَامَنُوٓا۟ أَطِيعُوا۟, 47:33) must not make a cross-word munfaṣil look
mid-word muttaṣil. Munfaṣil spans two words (the madd and the hamza that
causes it), so — like every other cross-word rule here — the key marks BOTH
words, not just the one carrying the madd. Verified against a teacher's own
answer key: 47:33 → 3, 71:1 → 2, 4:143 → 4.

**Why not cpfair any more.** cpfair/quran-tajweed's annotations are codepoint
offsets into Tanzil's 2017 text. quran.com's text adds a tatweel before dagger
alifs, a small mīm after ikhfā'/idghām tanwīn, and " ۖ" pause marks inside
words, so the offsets drifted one or more letters later in the ayah — inside
the old guard's tolerance (it only caught drift past the ayah's end). Found
when qalqala keyed the ل of عَلَقٍ (96:2); it is why 87:7 and 95:3 hamzat
al-waṣl keys were wrong. On 2026-10-01 every tap / count key in the homework
remake drafts was re-derived from the new source: none changed at word level.

## Edge cases

- **A rule spans two words.** Ikhfā' is usually a tanwīn ending one word meeting
  a letter starting the next (`سَبْعًۭا شِدَادًۭا`). Both words are marked correct, and
  the generated prompt says so. A student should never be marked on a convention
  they were not told.
- (cpfair era, obsolete) **The first ayah of a surah** carried the basmala in Tanzil's text, shifting
  every offset in it by the basmala's length plus one. Handled; do not "fix" it.
- **Choose a passage with enough instances.** An-Naba' 12–18 gives 4 instances in
  29 words. One instance in thirty words is a hunt, not a question. The dry run
  prints the counts.
- **Attaching to a homework that has submissions changes its total marks**, which
  is the divisor in `v_hw_pct_all` — every released percentage on that homework
  moves, and the term averages and leaderboards with them. During the refresh
  this is fine because the marks are being rebuilt anyway; outside it, prefer a
  homework nobody has handed in.
- **Seeded surahs are 1, 46–66 and 67–114** in `quran_words` (`seed_quran_words.ts
  --pages`); outside that the script has no words and stops. Surahs 1 and 46–66 were
  added for page-font/rendering coverage, not for tap questions — the hifz features
  key on surahs 67–114 only, so words outside that range are inert there and a tap
  question can still only draw a sensible passage from 67–114.
- **The `ۭ` marks are not a rule.** Across surah 78, 21 of the 40 words carrying
  U+06ED are touched by no ghunna-family rule at all. It is orthography, it gives
  no answer away, and stripping it would corrupt the text.

## Gotchas

- **`ghunnah` is derived from the text, not read from the markup (2026-10-05).**
  The course teaches, and the teachers confirmed, that EVERY mīm or nūn carrying
  a shaddah takes the ghunna, including a shaddah made by idghām (the مّ of
  رَاضِيَةً مَّرْضِيَّةً, 89:28). quran.com files those under idghām, so the
  markup-based key missed مَّرْضِيَّةً in Homework 2 Q8 and students who tapped it
  were marked wrong (fixed live by migration 0058). The script now keys any word
  with م or ن + U+0651 for `ghunnah`. If a paper means only the idghām, use
  `idghaam_ghunnah` / `idghaam_shafawi` instead.

- The shell here is zsh: an unquoted `$args` is NOT split into words, so
  `--rule $1 …` built from one variable is silently ignored and the script
  prints its DEFAULT passage (An-Naba' 12–18, ikhfā') for every run. Pass the
  flags literally, or split with `${=args}`.

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
- (obsolete, replaced 2026-10-02 — see "Inputs" above) `--audio` used to call
  quran.com's recitation endpoint (`/recitations/6/by_ayah/{surah}:{ayah}`),
  which returns `segments: undefined` unless the request carries
  `?fields=segments` explicitly. `--audio` now sources segments from QUL
  instead, which doesn't have this trap, but the quirk is left here as a
  reminder for anyone else calling quran.com's recitation endpoints directly.
- (cpfair era, obsolete) The old DATASET-offset derivation marked هَـٰٓؤُلَآءِ's
  hā' at-tanbīh (47:38) as not-munfaṣil, contradicting the mudood-3 teaching video
  (it did mark the same construction in هَـٰٓأَنتُمْ). The quran.com-markup
  derivation gets both right by position (see "How the key is derived" above); no
  longer a word to avoid.

## Loading homework

`execution/homework_sql.ts` is the loader-generator for a finished bundle of
homework papers (`docs/homework-2026-27/`, drafted in the review formats,
`tap` questions among them built from this directive's tool). Pipeline:

```
bundle (docs/homework-2026-27/.../*.json)
  → execution/homework_sql.ts <bundle.json> <migration.sql>   # reads quran_words for glyphs; writes nothing to the DB
  → review the generated SQL by eye
  → execution/apply_migration.ts <migration.sql>              # applies it, records it in schema_migrations
```

It only *reads* the database (mushaf glyphs for `tap` options); all writes are
emitted as one reviewable SQL file, applied in the usual way.

For a `tap` question, each option's `label` is
`surah:ayah:position:page:line` (one field longer than the hand-built tap
questions above, which stop at `page`) and `value` is still glyph and
readable text, tab-separated — but on the ayah's LAST word, `value` carries a
**third** tab field: the ayah's end-of-ayah rosette glyph. `TapWords` (`web/src/lib/homework/tap-words.ts`) uses the added `line` in the label and
that third field to lay the passage out on the mushaf's own printed lines
instead of wrapping plain text.

An option's `audio` is no longer only a bare URL — it may also be
`{ url, start_ms, end_ms }`, a slice into a QUL surah audio file (see
"Inputs" above), for an option that should play only part of a recitation.

**Guard:** the generated SQL aborts the whole migration if any existing
submission on a homework it replaces belongs to an account whose email is
not `@bsms-demo.test` — a real student's or teacher's submission blocks the
load outright rather than silently deleting their work. Demo-account
submissions (answers, voice notes, attempts) are deleted and replaced.

This section lives here (rather than its own directive) because it is the
direct downstream consumer of the `tap` question shape this directive
defines; if homework-loading grows beyond this one script, it may be worth
splitting into its own directive — flagged as a proposal, not done here.

## Verifying

Dry run reads. For the rendering, drive a real browser — grepping the HTML will
tell you the markup is right while the page looks wrong:

```sh
# scratchpad harness: signs in, screenshots, can tap words first
node shot.mjs adam.w@bsms-demo.test '<password>' /homework/107 out.png '.ar-tap'
```
