# The mistakes board — design

**Date:** 2026-10-01
**Builds on:** the mistakes picture brief (2026-10-01, on the teacher-hearings branch), `2026-08-14-hifz-peer-review-design.md`, `2026-09-16-range-hearings-design.md`
**Canvas:** https://claude.ai/code/artifact/07e24448-9770-49d6-9d67-26fe589a991a, artboard **E · The pick**
**Status:** agreed in conversation. Student side only this round; the teacher side is being redesigned separately.

## Goal

Replace the student's plain "Your feedback" (a recurring-mistakes list and a
page-by-page heatmap) with a board that shows, at a glance, how their Qur'an
is going: what kind of mistakes, where, and which ayahs to drill. It is a
snapshot of every mark they have. Progress over time lives elsewhere.

## Decisions (user-confirmed)

- **Composition: E.** The rule profile (C), then session-by-session columns
  (B, condensed) beside the surahs ranked by mistakes (A, condensed), then
  one "Ayahs to drill" card at a time, then the mushaf heatmap for any surah.
- **Source: one board, a Teacher / Partner / All switch, opening on All.**
  This changes the earlier rule that teacher and partner marks are never
  shown together: they may be mixed, but never without a label. On All the
  source stays visible: a filled dot under a teacher hearing's column and a
  ring under a partner session's, the same marks in the drill card's dots,
  and chips that say who logged a mistake.
- **No time windows.** No recent / older split, no "last marked" date. The
  session chart is the only view across sessions.
- **The session chart shows the last 12 sessions,** clean sessions included
  as a zero tick (a clean partner session is good news, and real partner
  sessions are often clean). Below 3 sessions it is replaced by a line.
- **No flag tile.** Teacher hearings record no session flags.
- **Ayahs to drill:** one card, arrows to step, **See all** expands the full
  list in place with **Show less** to collapse.
- **Mushaf heatmap:** pick any surah on the run and open it; tapping a surah
  in the list opens it too. It follows the switch.
- **Where:** the student's **Overview**, reordered to *Where you are → The
  journey → Your revision (activity grid, then the board)*. The Review tab
  keeps only reviewing your partner.

## Colour

Categories never reuse state colours (green passed, orange pending, red not
passed). Hifdh `#2f4fd0`, Tajweed `#1a9f7a`, Makhraj `#9b59c9` in light;
`#5a78ea`, `#24a985`, `#a56bd6` in dark. Validated with the dataviz
validator against all four card surfaces (cream and navy, light and dark).
The makhraj letter grid tints on the Makhraj hue's own ramp. The mushaf
heatmap keeps its existing tint for now (`heatClass` is shared with the
teacher pages, which are being redesigned); moving it off warn/danger is a
follow-up.

Retired categories (`fluency`) are left out of the board: the board's
sections are the three live categories, and a fourth that can no longer be
logged would only ever shrink.

## Units

- `lib/hifz/mistake-board.ts` — pure aggregation over sourced rows:
  `pickSource`, `hifdhSplit`, `tajweedByRule`, `makhrajByLetter`,
  `bySession`, `bySurah`, `ayahsToDrill`. Unit-tested.
- `lib/hifz/board-queries.ts` — `boardFor(studentId)`: every submitted
  session of the student (hearing and peer) and their mistakes, each tagged
  `teacher` or `partner`. Reads run as the caller, so RLS decides.
- `components/app/mistake-board.tsx` — the server component: switch,
  profile, sessions, surahs, drill, heatmap. Small client islands for the
  surah list expand, the drill carousel, the letter dialog and the surah
  picker.

## Empty states

- No marks at all: "No mistakes marked yet." and nothing else.
- None from the chosen source: "No teacher marks yet." / "No partner marks yet."
- Under 3 sessions: "2 sessions so far" in place of the chart.

## Testing

Unit tests for every aggregation; component tests for the empty states, the
sparse session line and the source labels. A look at real data at phone
width before shipping. Demo data for Adam Whitfield via
`execution/seed_mistakes_board_demo.ts` (idempotent, `--clear` removes it).
