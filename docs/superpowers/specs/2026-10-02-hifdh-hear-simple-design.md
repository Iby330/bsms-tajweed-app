# Simple hearing — design

**Date:** 2026-10-02
**Supersedes:** the hearing flow in `2026-10-01-hifdh-hear-tab-design.md` (Start and End hearing, the From/To popup) and the per-range verdict in `2026-09-16-range-hearings-design.md` (the Finish popup with a tick per surah).
**Status:** agreed in conversation after the teachers reviewed the live feature

## Goal

Teachers like marking mistakes in the app but found the hearing flow too
heavy. Split it into two simple acts:

1. **Hearing is just marking.** Pick the student you're listening to, tap
   the words they get wrong, and each mark is saved for the student at once.
2. **The result is a separate, deliberate step.** Afterwards the teacher
   passes or marks not passed, for one surah or several at a time, with
   notes, from the register or from the student's page.

## Decisions (user-confirmed)

- **Hear is one tab on the hifdh register,** beside Overview. It leaves
  each student's own page.
- **Hear works as the desk did before the Start/End change:** a student
  picker, then the mushaf, one page at a time with the shared pager
  (arrows, swipe), opening at that student's next surah and free to turn
  anywhere. No Start, no End, no range, no confirm.
- **Every tap saves straight away** and is visible to the student at once.
  Tapping a marked word again changes or removes the mark, which covers
  mis-taps.
- **Pass and Not passed** live in a popup opened from a button next to each
  student's name on the register Overview, and the same popup is on the
  student's own page.
- **The popup lists the student's surahs;** each has Pass and Not passed,
  neither chosen to begin with. An untouched surah stays exactly as it was,
  so a teacher can pass a few and mark one not passed in one go. Each surah
  has an optional note. One Save records everything.
- **"Not passed" stays the term,** and stays red on both sides.
- **Mistakes alone never make a surah not passed.** Only the teacher's
  choice in the popup does.
- **The student side is unchanged:** a surah shows the teacher's marks,
  the note, and passed or not passed.

## Non-goals

- Changing peer revision.
- Changing the mistakes board on the student Overview (it already reads
  teacher and partner marks).
- Deleting any recorded marks or results.

## Teacher pages

### Hifdh register: `/teacher/hifdh`

Tabs **Overview | Hear** (`?tab=hear`).

**Overview:** the class list and revision pairs, as now, plus a
**Pass / Not passed** button on each student's row that opens the result
popup for that student.

**Hear:**
1. **A student picker** (the teacher's roster, each with their next surah;
   students with no target are listed but disabled, "no target set").
   `?student=<id>` names the student; without it, the first student with a
   target is chosen. Changing student changes who the next taps are saved
   for.
2. **The mushaf,** one page at a time with the shared pager (`?p=`), the
   pages of that student's run, opening on their next surah's first page.
   Words marked for this student before are tinted underneath.
3. **Tapping a word** opens the marking sheet as today (category, detail,
   note, with earlier marks on that word listed above the picker). Save
   logs the mistake at once. Tapping a word marked today again lets the
   teacher change or remove it.
4. **A small line** under the picker: "<n> mistakes marked today", and a
   link to that student's page.

No Start, End, Finish, range, done line or Next student. Old
`/teacher/hifdh/hear` links redirect to `/teacher/hifdh?tab=hear` (with the
`student` param kept).

### A student's page: `/teacher/hifdh/[studentId]`

One page again, no tabs: where they are, pace, the surah grid, and the
**Pass / Not passed** button that opens the same popup. Below the grid,
"Partner revision" (the peer feedback the Hear tab shows today). Grid cells
open the read-only surah record as today. `?tab=hear` and `?tab=review`
redirect to the page itself.

### A surah's record: `/teacher/hifdh/[studentId]/[surah]`

As today (read-only mushaf with marks, the record line, the note, comment
edit and Undo pass), except "Hear from this surah" links to
`/teacher/hifdh?tab=hear&student=<id>&p=<that surah's first page>`.

### The result popup

- **Title:** "Results for <name>".
- **Rows:** the student's run from their next unpassed surah onwards,
  plus every surah currently not passed, in memorisation order. A "Show
  earlier surahs" link reveals the rest of the run (for correcting a past
  result).
- **Each row:** the surah name, its current state ("passed 12 Oct",
  "not passed", or nothing), and two buttons, **Pass** and **Not passed**.
  Neither is selected at the start; pressing the selected one again clears
  it. A note icon opens a note box for that row.
- **Save** is enabled once at least one row is chosen. It records every
  chosen row, closes the popup and shows "3 passed, 1 not passed" briefly.
- **Changing a passed surah to Not passed** removes the pass; the row's
  "passed 12 Oct" label is what makes that visible before saving.

## Data

**Results become explicit.** `hifz_records` keeps meaning "passed" (the
register's progress view, `v_hifz_progress`, counts it). A new table holds
"not passed":

```
hifz_not_passed (
  student_id    uuid  references profiles(id),
  surah_number  int   references surahs(number),
  marked_by     uuid  references profiles(id),
  marked_at     timestamptz default now(),
  teacher_comment text,
  primary key (student_id, surah_number)
)
```

RLS mirrors `hifz_records`: teachers manage; a student reads their own.

- **Pass** upserts `hifz_records` (comment = the row's note; `passed_at`
  untouched on a re-pass) and deletes any `hifz_not_passed` row.
- **Not passed** upserts `hifz_not_passed` (comment = the row's note) and
  deletes any `hifz_records` row.
- **State of a surah:** a record → passed; a not-passed row → not passed;
  otherwise unheard. The "a covering hearing means not passed" rule goes.
- **Backfill:** every surah that reads not passed today (a submitted
  hearing covers it and it has no record) gets a `hifz_not_passed` row in
  the migration, with the latest covering hearing's note and date, so
  nothing that is red today turns grey.

**Marks.** Each mark still needs a session. The first tap for a student
on a given UK day by a teacher creates that day's hearing session for the
pair, already submitted (so it is visible to the student at once), with
`surah_number` and `to_surah_number` both set to the first marked surah;
later taps that day reuse it. The range columns no longer mean anything to
the app. Readers that showed a surah's hearing marks keep working: they
read every hearing mistake on that surah.

## Server actions

- `logHearingMistake(studentId, location, category, detail, note)`:
  finds or creates today's session for (teacher, student) and logs the
  mistake (one per word per session, as `logMistake` does). Guards: the
  teacher's own student; the word's surah on the student's run.
- `removeHearingMistake(mistakeId)`: the teacher's own mistake only.
- `setResults(studentId, rows: { surah, result: "passed" | "not_passed", note? }[])`:
  validates every surah is on the student's run, then writes as above.
  Revalidates the register, the student page, the Hear tab and each
  surah's pages on both sides.
- `startHearing`, `submitHearing` and the range popup go, with their
  components (`hearing-start.tsx`, `hearing-finish.tsx`, `hear-panel.tsx`,
  `hear-tab.tsx` in its current form) and their tests.

## Testing

- Unit: the new state rule (record, not-passed row, neither; a surah with
  marks but no result stays unheard); the result popup (rows offered,
  nothing chosen to start, toggling, notes, Save payload, mixed results);
  the Hear logger (a tap logs at once for the chosen student, switching
  student redirects taps, remove).
- Live RLS check: a student reads their own not-passed rows, not
  another's, and cannot write them; a teacher can.
- Manual: mark mistakes for two students back to back; pass two surahs
  and mark one not passed in one popup; check the student sees the marks,
  notes, green and red.
