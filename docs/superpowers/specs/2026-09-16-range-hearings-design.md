# Range hearings and the hearing desk — design

**Date:** 2026-09-16
**Builds on:** `2026-09-15-teacher-hearing-design.md` (hearings as sessions, the per-surah pages, the lazy draft)
**Status:** approved in conversation; written up for implementation

## Goal

On the Thursday lesson a student presents several surahs in one go. The
teacher should hear them from one page: pick the student, the whole mushaf
opens at the student's next surah, the teacher taps mistakes and scrolls as
the student recites, and presses Finish once. The app works out how far
they got, shows the range for confirmation with a tick per surah, and signs
off the ticked ones. A surah heard but unticked stays visible to the student
as heard and not passed, with its marks, so they know what to bring back.

## Decisions (user-confirmed)

- **One page at a time, like the surah pages.** The desk uses the same
  pager as the per-surah pages: side arrows and a swipe turn the page,
  forward to the left, `?p=` names the page. It opens on the start surah's
  first page. The mushaf is the picker.
- **Start is the next surah, changeable.** A chip names it; the teacher can
  change it before the first tap. Once a draft has marks, the start is fixed.
- **End is worked out at Finish, then confirmed.** The surah on the page in
  view, widened so every tapped mark is inside the range. The popup shows
  the range and lets the teacher move the end.
- **One Finish, ticks per surah.** Every surah in the range is a row with a
  tick, all ticked by default. Confirm signs off the ticked surahs. Untick
  them all and nothing passes. There are no separate Passed / Not passed
  buttons any more, on either page.
- **Unticking revokes.** A surah that was passed before, re-heard in a range
  and unticked, loses its pass. The row says "passed 12 Oct" so this cannot
  happen unnoticed. Every mark, old and new, stays on the mushaf.
- **Three states everywhere.** Not heard, passed, and heard-not-passed. The
  third shows red on the student's journey, the teacher's grid, and both
  surah pages.
- **The per-surah pages stay.** The teacher's is a hearing of one surah,
  finishing through the same popup with one row. The student's is the
  record.

## Non-goals

- No per-surah verdict stored separately from the pass record; the state is
  derived (below). No new table.
- No change to peer review or to the timed-session design.

## Data

One migration, `0030_range_hearings.sql`.

**`revision_sessions`** gains `to_surah_number int references surahs(number)`
and loses `outcome`. `surah_number` remains the start. Memorisation order
runs down the mushaf, so `to_surah_number <= surah_number`; a hearing of one
surah has the two equal. Constraints: `(kind = 'hearing') = (to_surah_number
is not null)`; `to_surah_number <= surah_number`. The two outcome
constraints go with the column. Existing hearings are backfilled with
`to_surah_number = surah_number` before the not-null check lands.

**Derived state of a surah**, the only rule, used by every page:

- a pass record exists → **passed**;
- otherwise, any submitted hearing whose range covers it → **not passed**;
- otherwise → **not heard**.

This works because unticking deletes the record: a record exists only when
the latest word on that surah was a pass. Passes from before hearings
existed have no covering hearing and read as passed. Undo pass leaves the
hearing, so the surah reads as not passed afterwards, which is what it is.

**One open draft per teacher per student.** The desk resumes the student's
open draft wherever it started. The per-surah teacher page starts a hearing
of one surah only when the student has no open draft; when one exists it
shows "A hearing is in progress from Al-Ghashiyah" with a link to the desk
instead of a second logger, so two drafts for one student never exist.

## Pages

### The desk: `/teacher/hifdh/hear`

Reached from the Hear tab beside Overview on the hifdh register; a student's
own page has no Hear tab. `?student=<id>` names the student; without it the
roster's first student with a target is chosen.

Top to bottom:

1. **Header, sticky.** A student picker and the start chip are both the
   repo's `FilterSelect` (the roster, each with their next surah beside the
   name; the start, "Starting at Al-Ghashiyah", disabled once the draft has
   a mark); the mistake count; **Finish**.
2. **The mushaf.** One page at a time, the same `MushafPager` the per-surah
   pages use — side arrows and a swipe turn the page, forward to the left,
   `?p=` names the page — rendered by the logger itself — the desk has no
   separate `DeskLogger` component, just the chrome (pickers, done line,
   next-student link) around `ReviewLogger` in hearing mode. It opens on the
   start surah's first page. Words marked in earlier hearings of this
   student are tinted underneath, as on the per-surah page; tapping
   classifies as it does everywhere.
3. **Finish** opens the popup, titled "Finish hearing" with the range
   summary in a line beneath:
   - the range, "Al-Ghashiyah → Al-A'la · 2 surahs";
   - one row per surah in the range, in memorisation order, each with a
     tick (on by default) and, for a surah already passed, "passed 12 Oct";
   - "One more" / "One fewer" to move the end;
   - the note, "Note for the student (optional)";
   - **Confirm**.
   The default end is the surah containing the last word on the page in
   view, widened to include the lowest-numbered surah with a mark. If the
   page in view is before the start, the end is the start.
4. **After Confirm** the page stays on the student with a line "Heard
   Al-Ghashiyah → Al-A'la · 2 passed · 1 not passed" (`doneLine` in
   `hearings.ts`) and a **Next student** button that moves down the roster.

### The per-surah teacher page

As built, minus the two verdict buttons. Finish opens the same popup with a
single row. When the student has an open draft that started elsewhere, the
page shows the link to the desk instead of the logger.

### The grids and the student's surah page

The journey (student) and the grid (teacher) draw heard-not-passed cells
red (the `redo` class); a second sr-only span carries "heard, not passed"
alongside the cell's other screen-reader text (comment flag, meaning). The
student's surah page record line reads "Heard by Ustadh Bilal on 14 Sep ·
not passed · 3 mistakes" from the derived state, and shows the latest
hearing's note when the surah is not passed, the pass comment when it is.

## Server actions

- `startHearing(studentId, fromSurah)` — returns the student's open draft
  (any start) or inserts one with `surah_number = fromSurah` and
  `to_surah_number = fromSurah`.
- `submitHearing(sessionId, { to, passed, note })` — validates the session
  is the caller's open hearing, `to <= from`, that `[to, from]` lies on the
  student's own memorisation run (server-side, from `hifz_profiles` — a
  crafted `to` cannot reach into surahs the student was never assigned),
  and every surah in `passed` lies in `[to, from]`. For each surah in the
  range: in `passed` → upsert the record (comment = note, marked_by,
  session_id; `passed_at` untouched on conflict); not in `passed` → delete
  the record if one exists. Then the session: `submitted_at`,
  `to_surah_number = to`, `overall_note`. Records first, session second, as
  before. Revalidates the index pages and every surah page in the range,
  both sides.

## Shared code

- `lib/hifz/hearings.ts`: `surahState(surah, passed, hearings)`,
  `endSurahFor(from, lastSurahOnPage, markSurahs)` (the surah under the page
  in view — found separately via `lastSurahOn(pages, page)` — widened by
  any mark surahs), and `doneLine(from, to, passed, names)` for the desk's
  after-Confirm line; `recordLine` and `commentToShow` take the derived
  state instead of an outcome.
- `lib/hifz/hearing-queries.ts`: `hearingsForStudent(studentId)` (every
  submitted hearing's id, range, date, note, teacher name), `hearingsFor`
  now matches by range and returns only that surah's mistakes,
  `openDraftFor(teacherId, studentId)`.
- `lib/hifz/roster.ts`: `rosterWithNext()` — the teacher's roster with each
  student's own run and next-to-hear surah, computed once and shared by the
  register (`teacher/hifz`) and the desk, so the rule lives in one place.
- `components/app/mushaf-pager.tsx`: the pager the per-surah pages use,
  reused by the desk — arrows, swipe, and the `?p=` query param.
- `components/app/hearing-finish.tsx`: the popup, used by both logger modes
  of hearing. `components/app/review-logger.tsx`: hearing mode gains `from`,
  an `endFromPage` flag that proposes the range's end from the pager's page
  (the desk) rather than defaulting it to the start (the per-surah page),
  and renders `HearingFinish` itself — the desk has no separate
  `DeskLogger`; the verdict bar goes.

## Edge cases

- **Marks before the start.** A mark in a surah later in memorisation order
  than the start (a higher number) cannot widen the range backwards; it is
  logged and stays on that surah's page, and the popup does not list the
  surah. Rare; the popup makes it visible by omission.
- **Changing the start after marks.** Not allowed; the chip is disabled
  once the draft has a mark, with a tooltip saying why.
- **A student with no target.** The desk lists them greyed with "no target
  set" and will not open the mushaf for them.
- **Two teachers.** Each holds their own draft; the second Confirm wins on
  the records, as before.
- **Reload mid-hearing.** The draft, its start and its marks come back; the
  end is recomputed at Finish from where they are.

## Testing

- Unit: `surahState` (all three states, legacy pass, undone pass),
  `endSurahFor` (page before start, page after, marks widening, marks
  behind the start ignored), the range listing, `recordLine`,
  `commentToShow`.
- Component: `HearingFinish` (rows and ticks, revoke label, end movers,
  confirm payload), logger hearing tests updated for Finish, journey and
  grid draw `redo` cells.
- The desk's pager is the same `MushafPager` component the per-surah pages
  use, so it needs no separate test; the logger test covers `endFromPage`
  proposing the range's end from the pager's page (a page whose last word
  is a different, lower-numbered surah than the start) rather than the
  start alone.
- Live RLS check (`hearings_rls.sql`) updated: the hearing insert carries
  `to_surah_number`, and the submit update no longer touches the dropped
  `outcome` column.
- Manual: at the desk hear three surahs, untick the third, confirm; the
  student sees two green and one red with its marks and the note; re-hear
  the red one from its surah page and pass it; the register and journey
  update.
