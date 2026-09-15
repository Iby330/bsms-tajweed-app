# Teacher hearings — design

**Date:** 2026-09-15
**Builds on:** `2026-08-14-hifz-peer-review-design.md` (sessions, mistakes, the mushaf logger)
**Status:** draft for review

## Goal

When a student presents a surah to the teacher, the teacher marks the
mistakes live on the mushaf while the student recites, then ends with one of
two verdicts: **Passed** or **Not passed**, with a note. Afterwards, the
student opens that surah and sees the mushaf with the teacher's marks on it.
The teacher opens the same surah from the student's hifdh page and sees the
same mushaf, ready to hear it again.

Peer revision is untouched. Students keep logging each other on the Review
tab, and that feedback stays where it is. A hearing is the teacher's record
of a surah; peer review is the partner's record of a session. The two are
kept apart on screen even though they share a table underneath.

## Decisions (user-confirmed)

- **Peer revision stays as built.** Pairs, drafts, the Review tab, the
  cross-surah feedback view: none of it changes here.
- **A hearing is a session with a teacher as reviewer**, tied to one surah.
  Same tables, same mistake vocabulary, same logger.
- **The teacher's surah page is the logger.** No "start" step, no mode
  toggle. Open the surah, tap as the student recites, press Passed or Not
  passed at the bottom. Each button opens the same small popup for a note.
- **The student's surah page shows the teacher's marks only.** Peer mistakes
  never appear there; they live on the Review tab as today.
- **The marking panel on the teacher's grid goes away.** Tapping a surah cell
  opens the surah page. One place to sign a surah off, not two.

## Non-goals

- No timer on hearings. The timed-session columns from the peer spec are
  nullable and stay peer-only.
- No session flags on hearings. The verdict and the note carry everything.
- No change to the cross-surah feedback view. Which visualisation goes there
  is its own decision (see the canvas from 2026-09-14) and is not blocked by
  this work.
- No hearing of a surah outside the student's run. The surah page exists for
  every surah in the run, passed or not; nothing else is reachable.

## Data

One migration, `0024_teacher_hearings.sql`.

**`revision_sessions`** gains three nullable-by-default columns:

| column | type | meaning |
| --- | --- | --- |
| `kind` | text, not null, default `'peer'` | `'peer'` or `'hearing'` |
| `surah_number` | int | the surah heard; set iff `kind = 'hearing'` |
| `outcome` | text | `'passed'` or `'not_passed'`; set on submit of a hearing |

Constraints: `kind in ('peer','hearing')`; `outcome in ('passed','not_passed')`;
`(kind = 'hearing') = (surah_number is not null)`; `outcome is null` when
`kind = 'peer'`. Existing rows default to `'peer'` and satisfy all of it.

**`hifz_records`** gains `session_id uuid references revision_sessions(id)`,
nullable. A pass produced by a hearing points at it; passes from before this
change, and any made without a hearing, keep null. `teacher_comment` stays the
student-facing comment and everything that reads it today is unchanged. On
Passed the hearing's note is written to both `overall_note` and
`teacher_comment`; that duplication is deliberate so the surah page and the
journey keep reading one field.

**Row-level security.** Teachers can already read every session and mistake.
They gain:

- insert on `revision_sessions` where `is_teacher()`, `reviewer_id = auth.uid()`
  and `kind = 'hearing'`;
- update on their own sessions;
- insert and delete on `revision_mistakes` for their own unsubmitted sessions.

The existing student insert policy gains `kind = 'peer'`, so a student can
never create a hearing. Reciter reads are unchanged: a student sees a
session, and its mistakes, only once `submitted_at` is set. That is the rule
that keeps a half-finished hearing invisible.

The active-pair uniqueness on drafts is peer-only. A teacher may hold one
open draft per student per surah; `startHearing` reuses it.

## Pages

### Teacher: `/teacher/hifz/[studentId]/[surah]`

Reached by tapping a surah cell on the student's hifdh page. The cell keeps
its speech mark for "has a comment" and links here instead of opening the
panel; the panel and its three buttons are deleted from `HifzGrid`.

Top to bottom:

1. **Masthead.** Student name, surah name in both scripts, position in the
   run ("12 of 37"), and the record line: "Heard 14 Sep · passed · 3 mistakes"
   or "Not yet heard". A passed surah also shows the comment and two quiet
   links: Edit comment, Undo pass. These keep `setSurahComment` and
   `unmarkSurah` alive; undoing removes the record and leaves the hearings.
2. **The mushaf, scoped to the surah.** The pager runs only over the pages
   the surah occupies. Words carry heat from every *submitted* hearing of this
   surah; marks from the current draft render as they do in the peer logger.
   Tapping a word classifies it exactly as the peer logger does. Tapping a
   hot word with no draft mark shows its history (what, when).
3. **The verdict bar**, sticky at the bottom: mistake count on the left,
   **Not passed** and **Passed** on the right. Either opens the popup: one
   textarea, "Note for the student", and a confirm button named after the
   verdict. Confirming submits the hearing.

**The draft is created lazily.** Opening the page creates nothing. The first
tap, or pressing either verdict button, calls `startHearing(studentId, surah)`
which returns the existing draft for that student and surah or inserts one.
A teacher who opens a surah to look and leaves creates no row. A teacher who
taps three words and closes the tab finds those three marks waiting next
time, the same as a peer draft.

**A hearing with no mistakes is still a hearing.** Passed with nothing
tapped submits a session with zero mistakes and writes the record. That is
the common case for a well-prepared student and must be one press.

**Hearing a passed surah again** works the same way. Passed updates the
record's comment and `session_id`; Not passed submits the hearing and leaves
the record alone. The pass date is never reset by a re-hearing.

### Student: `/hifz/[surah]`

The page that exists today, with the mushaf added between the record and the
introduction:

1. Record line, as today, now with who heard it: "Heard by Ustadh Bilal on
   14 Sep · 3 mistakes" and the comment. The teacher's name is read through
   the admin client, as reviewer names are on the Review tab, because
   profiles are not cross-readable.
2. The mushaf, scoped to the surah, tinted by the teacher's submitted
   hearings of this surah only. Tapping a hot word opens the same history
   dialog the Review tab's heat viewer uses: label, date, note. No logging
   here; the student can only read.
3. The introduction, unchanged.

A surah with no submitted hearing shows the mushaf untinted with one line:
"Not heard yet."

### What does not change

The journey grid, the hifdh register, the Review tab on both sides, the
peer logger, the feedback view, the pairing panel.

## Server actions

In `lib/hifz/hearing-actions.ts`, each guarded by `requireTeacher()` and
`requireOwnStudent()` as the marking actions are, then by RLS:

- `startHearing(studentId, surah)` → returns the open draft id for this
  student and surah, inserting one if none.
- `logMistake` and `removeMistake` are reused unchanged; RLS admits the
  teacher on their own draft.
- `submitHearing(sessionId, outcome, note)` → sets `submitted_at`,
  `outcome`, `overall_note`. When `outcome = 'passed'`, upserts
  `hifz_records` with `teacher_comment = note`, `marked_by`, and
  `session_id`. Both writes happen in one server action; if the record write
  fails the session is left unsubmitted and the error surfaces.

`markSurahPassed` stays for the register's bulk paths but is no longer
reachable from the surah page.

## Shared code

- **`surahPageRange(surah, startPages, lastPage = 604)`** in
  `lib/quran/mushaf.ts`: pure. A surah spans from its own start page to the
  start page of the next surah in mushaf order (surah + 1), inclusive, or to
  `lastPage` for An-Nas. Unit-tested, including a surah that shares a page
  with its neighbour on both sides.
- **`hearingsFor(studentId, surah)`** in `lib/hifz/hearing-queries.ts`:
  submitted hearings of one surah with their mistakes and the teacher's name.
  Runs as the caller, so RLS decides what a student sees.
- **`SurahMushaf`**: the scoped mushaf with heat and tap history, built from
  `MushafPager` + `HeatViewer`, used by the student page and by the teacher
  page when it renders history for hot words.
- **`ReviewLogger`** gains a `mode`: `'peer'` (today's header and finish
  dialog) or `'hearing'` (the verdict bar and its popup), and accepts
  `sessionId: string | null` with an `ensureSession()` callback for the lazy
  draft. The tap-to-classify sheet is shared untouched.

## Edge cases

- **Two teachers, one student.** Each holds their own draft; the second to
  press Passed updates the record. Acceptable: the grid already lets any
  teacher of the class mark.
- **Student opens the surah mid-hearing.** Sees the previous hearing's marks
  only. The draft is invisible until submitted.
- **Undo pass after a hearing.** The record row goes; the hearing and its
  marks stay untouched, outcome included. The record line then reads
  "Heard 14 Sep · not signed off": the date and marks come from the latest
  hearing, the status from the absence of a record.
- **A surah outside the seeded mushaf** (67–71 today) returns `notFound()`
  on both pages, as the student page already does.
- **Note left empty.** Allowed on both verdicts; `overall_note` and
  `teacher_comment` become null.

## Testing

- Unit: `surahPageRange`; per-surah aggregation of hearing mistakes; the
  record line formatter for every combination of passed, not passed, no
  hearing, and no record.
- Component: the verdict bar and popup (confirm button reads the verdict;
  submits with the note; disabled while pending); `HifzGrid` cells render as
  links and no longer mount a panel.
- Live RLS test, in the style of `indexcheck.live.test.ts`: a teacher can
  insert a hearing and its mistakes; a student cannot insert a hearing; a
  student reads a hearing's mistakes only after submit.
- Manual: hear a surah with no mistakes and press Passed in one press; hear
  with three mistakes, Not passed, reopen, see the three marks in history;
  student opens the surah and sees exactly those three.
