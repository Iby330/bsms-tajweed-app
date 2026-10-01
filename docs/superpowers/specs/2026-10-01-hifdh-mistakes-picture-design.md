# The mistakes picture — design brief

**Date:** 2026-10-01
**Builds on:** `2026-10-01-hifdh-hear-tab-design.md` (the Hear tab), `2026-09-16-range-hearings-design.md` (hearings and their marks), `2026-08-14-hifz-peer-review-design.md` (partner revision)
**Status:** brief for a separate design session. The direction is not yet chosen; the open questions at the end must be settled before a plan is written.

## Goal

Show a student's mistakes as a picture instead of a list, so a teacher
can see in a few seconds where the student struggles, what kind of slip
it is, whether it is getting better, and what to drill next. Today the
only views are a plain recurring-mistakes list and a page-by-page mushaf
heatmap that needs paging through to see anything. Users described it as
looking dead.

## Where it lives

On the teacher's student page, **Hear tab**, below the hearing (sections
6 and 7 of the Hear tab spec). The picture replaces section 6's plain
"Teacher hearings" list. Partner revision (section 7) stays a separate,
labelled section beneath it, because teacher marks and partner marks are
kept apart on screen everywhere in the app.

The student side does not get it in this round (see open questions).

## The data that exists

Every mark is a `revision_mistakes` row (`MistakeRow` in
`web/src/lib/hifz/mistakes.ts`): `surah_number`, `ayah_number`,
`word_position` (null = the whole ayah), `category` (`hifz`, `tajweed`,
`makhraj`; `fluency` retired but still stored), `detail` (the rule id for
tajweed, the Arabic letter for makhraj, the slip for hifdh: forgot,
swapped, added), `note`, `created_at`, `session_id`. Labels come from
`web/src/lib/hifz/mistake-taxonomy.ts` (`detailLabel`).

Each mark belongs to a session (`revision_sessions`): `kind` is
`hearing` (teacher) or `peer` (partner); hearings carry a range
(`surah_number` → `to_surah_number`) and `submitted_at`. A surah's state
is derived by `surahState()` in `web/src/lib/hifz/hearings.ts`: passed,
not passed (heard, no pass record), or unheard.

Readers already built:
- `hearingsForStudent(studentId)` and `hearingMistakesFor(studentId)` in
  `web/src/lib/hifz/hearing-queries.ts` (teacher marks).
- `feedbackFor(studentId)` in `web/src/lib/hifz/review-queries.ts` (peer
  sessions and marks, `kind = 'peer'`).
- `aggregatePatterns`, `aggregateFlags`, `wordHeat`, `heatClass` in
  `mistakes.ts`; `spreadHeat` in `heat-spread.ts`.
- `rosterWithNext()` and `memorisationList()` give the student's run.

Every component that shows marks must take the source explicitly
(teacher, partner) and never mix them silently.

## The four directions explored

The canvas from 2026-09-14 drew each with the same sample data:
https://claude.ai/code/artifact/07e24448-9770-49d6-9d67-26fe589a991a

- **A. Where it hurts (place).** The student's whole run as one strip of
  surah cells, An-Nas to the target, each tinted by mistake count, the
  current surah outlined. Beneath: surahs ranked by mistakes, with
  recent and older shown as two shades of one bar. Strength: hifdh is
  spatial, students think in surahs. Weakness: says nothing about the
  kind of slip or the trend.
- **B. Getting better? (time).** Summary tiles (mistakes in the last 28
  days and the change, sessions, strong recitation flags), mistakes per
  session as stacked columns by category, and the recurring list given a
  12-week sparkline and an up or down arrow per pattern. Strength: the
  question teachers actually ask. Weakness: says little until there are
  several sessions.
- **C. The rule profile (kind).** Hifdh slips as one split bar, tajweed
  rules as bars, makhraj as a grid of Arabic letters tinted by count.
  Strength: the letter grid shows what no list can. Weakness: abstract
  for a young student; explains the student rather than the next lesson.
- **D. Ayahs to drill (specifics).** The worst ayahs as cards: the ayah
  text with the problem words highlighted, chips for what went wrong, and
  dots for which recent sessions it came up in. Strength: the most
  actionable; reads as homework. Weakness: a feed, not an overview.

The canvas's recommended board combined them: three tiles, the surah
strip, session columns beside a compact recurring list with sparklines,
and three ayah cards, with the existing mushaf heatmap one tap away.

## Constraints to respect

- The app's theme tokens and existing visual vocabulary
  (`web/src/app/globals.css`; navy and cream themes, light and dark).
  State colours are reserved: green passed, orange pending, red not
  passed or wrong. Do not reuse them for categories.
- Any categorical palette must pass the dataviz skill's validator
  (`node scripts/validate_palette.js`), in light and dark. The canvas
  used `#2f4fd0` (hifdh), `#1a9f7a` (tajweed), `#9b59c9` (makhraj),
  which passed in light mode only; re-check against the real surfaces.
- No em dashes in user-facing copy.
- Must work at phone width (teachers use tablets and phones).
- A student with few or no marks must get an honest empty state, not
  empty axes.

## Open questions to settle first

1. Which direction, or which combination? The recommended board is a
   starting point, not a decision.
2. Source: teacher marks only in the picture with partner marks in their
   own section below (the Hear tab's current shape), or one picture with
   a Teacher / Partner / All switch defaulting to Teacher?
3. Time window: all time, this year (the student's current run), or a
   selectable window?
4. Should the student see their own picture, and where (the bottom of
   their Review tab is the obvious place)?
5. Does "Ayahs to drill" link into the mushaf at that ayah, and on which
   page: the surah record page or the Hear tab?

## Testing expectations

Aggregation as pure, unit-tested functions (counts per surah, per
category and detail, per session, trend over a window, worst ayahs),
kept separate from the components. Component tests for the empty state
and for the source label on every section. A look at real data on a
phone-width screen before shipping.
