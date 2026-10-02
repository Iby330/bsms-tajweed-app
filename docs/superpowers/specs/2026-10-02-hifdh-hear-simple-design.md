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
- **Pass and Not passed use the popup teachers already know,** the one
  End hearing opens today: From and To, a tick per surah (ticked passes,
  unticked is not passed), a note, Confirm. It is opened by a button on
  each student's row on the register Overview, and by the same button on
  the student's own page.
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

**Overview:** exactly as it is now (the class list and revision pairs),
plus a **Pass / Not passed** button on each student's row that opens the
same result popup the student's own page has.

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
5. **Below the mushaf, for the chosen student,** the two sections the
   per-student Hear tab has today: "Teacher hearings" (recurring mistakes
   from teacher marks) and "Partner revision" (the peer feedback).

This is today's per-student Hear tab, simplified and moved: the picker
replaces arriving from the student's page.

No Start, End, Finish, range, done line or Next student. Old
`/teacher/hifdh/hear` links redirect to `/teacher/hifdh?tab=hear` (with the
`student` param kept).

### A student's page: `/teacher/hifdh/[studentId]`

One page again, no tabs: today's Overview (where they are, pace, the
surah grid) and the **Pass / Not passed** button that opens the result
popup. Grid cells open the read-only surah record as today. The student's
mistake sections move with Hear to the register. `?tab=hear` and
`?tab=review` redirect to `/teacher/hifdh?tab=hear&student=<id>`.

### A surah's record: `/teacher/hifdh/[studentId]/[surah]`

As today (read-only mushaf with marks, the record line, the note, comment
edit and Undo pass), except "Hear from this surah" links to
`/teacher/hifdh?tab=hear&student=<id>&p=<that surah's first page>`.

### The result popup

`HearingFinish` as it is today, unchanged in look and behaviour: the range
summary, From defaulting to the student's next unpassed surah and To to
the same, "One more" / "One fewer", a tick per surah (on by default), the
"passed 12 Oct" label on surahs passed before, the note, Confirm. Opened by
a **Pass / Not passed** button on the student's row (register Overview)
and on the student's own page, with no hearing in progress needed.

## Data

Nothing changes in what anyone sees: passed is green, not passed is red,
on both sides, decided by the same rule as today (a pass record means
passed; otherwise a submitted result covering the surah means not passed).

One internal change keeps that rule true now that marks save at once:
`revision_sessions` gains `counts_as_result boolean not null default true`.
Every existing session keeps `true` (all of them ended with a confirmed
range). Marking sessions created by Hear are inserted with `false`, so a
surah never turns red just because a mistake was marked on it. The
coverage rule in `surahState` (and its readers) counts only sessions with
`counts_as_result = true`.

**Results.** Confirming the popup inserts a submitted hearing session
with `kind = 'hearing'`, `counts_as_result = true`, the chosen From/To and
the note, then writes the passes and removes revoked passes exactly as
`submitHearing` does today (records first, then the session).

**Marks.** The first tap for a student on a given UK day by a teacher
creates that day's marking session for the pair, already submitted (so the
student sees it at once), `counts_as_result = false`, with `surah_number`
and `to_surah_number` set to the first marked surah; later taps that day
reuse it. Readers that show a surah's hearing marks read marks from both
kinds of hearing session.

## Server actions

- `logHearingMistake(studentId, location, category, detail, note)`:
  finds or creates today's session for (teacher, student) and logs the
  mistake (one per word per session, as `logMistake` does). Guards: the
  teacher's own student; the word's surah on the student's run.
- `removeHearingMistake(mistakeId)`: the teacher's own mistake only.
- `recordResults(studentId, { from, to, passed, note })`: `submitHearing`'s
  validation and writes, but creating its own result session instead of
  finishing a draft. Revalidates the register, the student page, the Hear
  tab and each surah's pages on both sides.
- `startHearing`, `submitHearing`, the Start popup and the End-hearing
  flow go (`hearing-start.tsx`, `hear-panel.tsx`, the Start/End parts of
  `review-logger.tsx`, `hear-tab.tsx` in its current form) with their
  tests. `hearing-finish.tsx` stays and is reused by the popup.

## Testing

- Unit: the state rule counts only result sessions (a surah with marks
  but no result stays unheard); the popup opened from the register row and
  the student page submits `recordResults` with the range, ticks and note;
  the Hear logger (a tap logs at once for the chosen student, switching
  student redirects taps, remove).
- Live RLS check: the existing hearings check still passes with marking
  sessions (`counts_as_result = false`) included.
- Manual: mark mistakes for two students back to back; from a register
  row pass two surahs and leave one unticked in one popup; check the student sees the marks,
  notes, green and red.
