# The Hear tab — design

**Date:** 2026-10-01
**Builds on:** `2026-09-16-range-hearings-design.md` (range hearings, the Finish popup, derived surah state)
**Status:** agreed in conversation

## Goal

Make each teacher page do one job. A student's page gets two tabs:
**Overview**, which is the record, and **Hear**, which is where the
teacher hears that student and sees their mistake picture. A hearing
starts only when the teacher says so, with the range chosen up front, so
a stray tap can never start one and the end of the hearing is no longer
guessed from the page on screen.

## Decisions (user-confirmed)

- **One place to hear: the student's Hear tab.** The register's Hear tab
  and the surah page's logger both go.
- **The surah page is the record,** the same shape the student sees: the
  surah's mushaf with the teacher's marks, the notes, the pass status.
  No marking there.
- **Start hearing opens a popup** headed with the student's name, with
  From (default: the student's next surah) and To (default: the same
  surah). The student is not chosen in the popup: the page already names
  them.
- **Before Start, the mushaf is look-only.** Earlier marks are tinted and
  tapping one shows what was said; nothing is logged and no hearing is
  created.
- **End hearing opens the existing confirm popup,** starting from the
  planned range, widened to cover any mark beyond the planned end. The
  teacher can still move the end and untick surahs not passed.
- **"Next student"** follows each hearing, so a teacher can run through
  the class without going back to the list.
- **Peer and teacher marks stay apart.** Under the hearing: "Teacher
  hearings" (recurring mistakes from hearings), then "Partner revision"
  (the feedback the Review tab shows today).
- **The student side does not change.**

## Non-goals

- The cross-surah mistakes visualisation from the 2026-09-14 canvas. It
  will live under the hearing on the Hear tab, and is designed separately.
- A mistake picture on the student side.
- Any database change: the planned end goes in the existing
  `to_surah_number`, set when the hearing starts and confirmed at the end.

## Teacher pages

### Hifdh register: `/teacher/hifdh`

The class list only. The Overview | Hear tabs above it go.
`/teacher/hifdh/hear` redirects: with `?student=<id>` to that student's
Hear tab, otherwise to the register.

### A student's page: `/teacher/hifdh/[studentId]`

Tabs **Overview | Hear** (`?tab=hear`). `?tab=review` from old links
redirects to `?tab=hear`.

**Overview** is today's page: where they are, pace, the surah grid with
red heard-not-passed cells. A grid cell opens the surah's record page.

**Hear**, top to bottom:

1. **The hearing bar.** The student's name and, before a hearing,
   **Start hearing**. During a hearing: the range ("Al-Ghashiyah → Al-A'la"),
   the mistake count, **End hearing**.
2. **The mushaf,** one page at a time with the shared pager (arrows,
   swipe, `?p=`). Before a hearing it opens on the student's next surah;
   after Start it jumps to the From surah's first page. Tapping a word:
   before a hearing, shows its earlier marks read-only (or nothing);
   during a hearing, opens the marking sheet.
3. **The Start popup:** "Hearing <name>", From (the student's run,
   default next surah), To (From down to the end of the run, default From),
   **Start**. Start creates the draft with `surah_number = From` and
   `to_surah_number = To`.
4. **The End popup:** `HearingFinish` as built, with its initial end =
   the planned To, lowered to the furthest marked surah if a mark lies
   beyond it. Confirm submits as today.
5. **After Confirm:** the line "Heard … · N passed · M not passed" and a
   **Next student** link to the next student on the roster with a target
   (their Hear tab). The bar returns to Start hearing.
6. **Teacher hearings:** the recurring-mistakes list built from this
   student's hearing mistakes (the existing pattern tracker).
7. **Partner revision:** the existing peer feedback (pattern tracker and
   mushaf heatmap) that the Review tab shows today.

A student with no target: the tab says "No target set for this student
yet." and shows sections 6 and 7 only.

A hearing already open (after a reload, or left from before): the tab
opens in the hearing state with its range and marks; Start is not shown.
A draft from before this change has `to_surah_number = surah_number`,
which reads as a one-surah plan and widens to its marks at the end.

### A surah's record: `/teacher/hifdh/[studentId]/[surah]`

Read-only: masthead with the record line, the mushaf for that surah's
pages tinted by every submitted hearing's marks on it (tap for history),
the latest note, and the existing comment edit and Undo pass actions. A
link "Hear from this surah" opens the Hear tab with From preset to it
(`?tab=hear&from=<n>`). No logger, no draft handling.

## Student pages

Unchanged: Overview (journey grid; a surah opens its record with the
teacher's marks and notes) and Review (partner revision).

## Server and shared code

- `startHearing(studentId, from, to)`: validates both on the student's
  run and `to <= from`; returns the open draft if one exists (its own
  range wins), else inserts with the planned range.
- `endSurahFor(from, plannedTo, markSurahs)`: the planned end replaces
  the page in view; marks below it widen the range; marks behind the
  start never do. `lastSurahOn` and the logger's `endFromPage` go.
- `ReviewLogger` hearing mode: a not-started state with no lazy draft
  creation on tap; `hearing.plannedTo`; Start and End in the bar.
- The desk page and `HearingDesk` are replaced by a Hear tab component;
  `rosterWithNext()` still supplies the next student.

## Testing

- Unit: `endSurahFor` with a planned end; the Start popup (defaults,
  To never above From, payload); the logger's not-started state (taps
  log nothing, history read-only, Start creates once, resumed drafts
  start started, after Confirm back to not-started); Next student.
- Pages: `?tab=review` and `/teacher/hifdh/hear` redirects; the surah
  record page has no logger.
- Manual: hear a range on a tablet start to finish; reload mid-hearing;
  open a surah record from the grid; Next student through three students.
