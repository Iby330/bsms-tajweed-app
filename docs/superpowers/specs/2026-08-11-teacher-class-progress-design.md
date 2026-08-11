# Teacher Class Progress — design

**Date:** 2026-08-11
**Scope:** a new per-student section on teacher `/teacher/home`, plus one correctness fix
to `/teacher/hifz`. No database changes, no new views, no new migrations.

## Problem

A teacher opening the dashboard sees pending submissions and three class-level averages.
There is no per-student view anywhere on it. To answer "how is each person in my class
doing" they must open two other pages and hold the answer in their head:

- `/teacher/hifz` — next surah, `passed/target · expected N`, and an ahead / on pace /
  behind badge. **No homework average.**
- `/teacher/roster` — homework average per term, exams, term %, EOY, and hifz reduced to
  a bare `passed/target`. **No surah, no pace status.**

Neither page answers the question on its own, and neither is the dashboard. The
capability already exists; it is the composition that is missing.

## Decisions made (with the user)

1. **Placement: a new block on `/teacher/home`**, under the existing average tiles. The
   tiles give the class number, the list breaks it into people. Roster and the Hifz
   register are left untouched as the deep-dive pages.
2. **"On surah" means the LAST surah passed**, not the next one to memorise. A student
   who has passed nothing shows `—`.
3. **The teacher picks the ordering from a dropdown**, defaulting to needs-attention.
   Reuses the `FilterSelect` component already built for the student Progress and Home
   pages.
4. **Rendered as a list of rows, not a table.** Roster's table is already 860px and
   scrolls horizontally; the teacher nav is built mobile-first on the stated grounds
   that the register gets taken on a phone, in the room. A `<ul>` stacks without a
   scrollbar.

## Data layer (no DB changes)

### New file `web/src/lib/teacher/class-progress.ts`

Pure functions and types, no database access, unit-tested with vitest alongside
`homework/sort.test.ts` — the file it is modelled on.

```ts
type ClassRow = {
  studentId: string;
  name: string;
  lastPassed: string | null;   // surah name_en; null when nothing passed
  passed: number;
  target: number;
  expected: number;
  pace: PaceStatus | null;     // null when the student has no hifz profile
  hwAvg: number | null;        // null when no marked homework this term
};

const CLASS_SORTS = ["attention", "name", "lowest-hw"] as const;
type ClassSort = (typeof CLASS_SORTS)[number];

function sortClassRows(rows: ClassRow[], sort: ClassSort): ClassRow[];
function lastPassedSurah(
  startSurah: number,
  target: number,
  surahs: Surah[],
  passedNumbers: Set<number>,
): Surah | null;
```

**`lastPassedSurah`** walks the student's own `memorisationList(startSurah, target,
surahs)` and returns the **furthest-along** surah carrying a record — deliberately not
the most recent `passed_at`. Sign-offs can land out of order, and furthest-along is the
definition that stays consistent with the `passed/target` count driving the pace badge
in the same row. Most-recent-by-date could render "Al-Fajr" beside a count of 12 and
read as a contradiction the teacher has no way to resolve.

Reusing `memorisationList` is also what makes this correct for returning students, whose
`start_surah` is not 114.

**Pace** is not recomputed here. It comes from the existing tested `expectedPassed()`
and `paceStatus()` in `lib/hifz/pace.ts`, which derive expected progress from the
teaching calendar (terms are not equal length) and round up.

### New query `getClassProgress(classId, termId)` in `lib/dashboard/queries.ts`

One `Promise.all`, assembling `ClassRow[]`:

| Source | Gives |
| --- | --- |
| `profiles` — `class_id`, `role = student`, `is_active = true` | the roster |
| `v_hifz_progress` | `passed`, `target_count`, `start_surah` |
| `hifz_records` — `student_id`, `surah_number` | which surahs, for last-passed |
| `v_termly_avg` at `term_id` | `hw_avg` |
| `surahs` | names, ordered by `order_index` |

The `is_active = true` filter matches what the tiles directly above already use, so the
list length always agrees with the "Active students" figure sitting next to it.

Every grade number still comes from a view. Nothing in this file recomputes a mark —
the same rule `queries.ts` already documents at the top.

### New component `web/src/components/app/class-progress.tsx`

Client component holding the sort state. Structurally identical to
`marked-homework.tsx`: every row is already on the page, so sorting reorders in the
browser — no round trip, and no URL state to keep in step with a server render. Carries
the same `aria-live` announcement, since reordering is silent to a screen reader.

Each row links to `/teacher/hifz/[studentId]`, which already exists and is where a
teacher goes to sign a surah off.

```
My class                                Sort: [ Needs attention ▾ ]
┌──────────────────────────────────────────────────────────┐
│ Yusuf Ahmed          At-Tin                              │
│                      8/43 · expected 10   64.8%  [behind]│
│ Zainab Malik         Al-ʿAlaq                            │
│                      9/43 · expected 10   71.0%  [behind]│
│ Bilal Rahman         Ash-Shams                           │
│                     10/43 · expected 10   72.1% [on pace]│
│ Aisha Khan           Al-Balad                            │
│                     12/43 · expected 10   87.4%   [ahead]│
└──────────────────────────────────────────────────────────┘
```

Badge wording and colours match `/teacher/hifz` exactly — `ahead` / `on pace` /
`behind` / `no target`, on the existing `ok` / `warn` / `danger` / `muted` tokens. Two
pages showing the same status in different words would be worse than either wording.

## Sort rules

| Option | Label | Rule |
| --- | --- | --- |
| `attention` (default) | Needs attention | behind → on pace → ahead → no target; name A–Z within each group |
| `name` | Name A–Z | name A–Z |
| `lowest-hw` | Lowest homework | `hwAvg` ascending, **null last** |

Null `hwAvg` sinks to the bottom of the homework sort rather than sorting as zero —
the same rule and the same reasoning as `lib/homework/sort.ts`. A student with no
marked work yet is not the weakest student in the class, and heading the list with them
buries the ones who are.

Null `pace` (no hifz profile) sinks to the bottom of the attention sort for the same
reason: a missing target is a data gap, not a struggling student.

Every ordering falls back to name on a tie, so the list is never arbitrary and never
shuffles between renders.

## Edge cases

| Case | Renders |
| --- | --- |
| No hifz profile | `no target` badge; sorts last under "needs attention" |
| Nothing passed yet | last-passed `—` |
| No marked homework this term | `—`; sinks in the homework sort |
| Teacher has no class assigned | existing "No class assigned" header; section shows an empty state |
| Class has no students | "No students in this class yet." |
| Student has finished their target | last-passed is the final surah in their list. Pace follows `paceStatus` unchanged: `ahead` if they finished before the calendar expected it, `on pace` once `expectedPassed` has clamped up to the target at the end of the year. No special-casing. |

The homework average inherits `v_termly_avg`'s rule: unsubmitted work is **excluded**
from the mean, not counted as zero. `/teacher/roster` footnotes this; this section
footnotes it too, so the figure is not read as harsher than it is.

## Correctness fix shipped alongside

`web/src/app/teacher/hifz/page.tsx:66` computes the next surah as `surahs[passed]`,
indexing the global ordered list and ignoring the student's `start_surah`. It is correct
only for students starting at An-Nas; every returning student who starts partway down
the run is shown the wrong surah. `memorisationList()` exists for exactly this and
`/teacher/hifz/[studentId]` already uses it properly.

Routed through `memorisationList()` as part of this work, since the new code cannot
reuse the broken expression and the file is already open. Covered by the
`lastPassedSurah` returning-student test.

## Tests

`web/src/lib/teacher/class-progress.test.ts`, vitest, no database:

- each of the three orderings produces the expected sequence
- null `hwAvg` sinks under `lowest-hw` rather than sorting as zero
- null `pace` sinks under `attention`
- ties fall back to name, so ordering is stable across renders
- `lastPassedSurah` returns the furthest-along record, not the most recently dated one,
  when sign-offs are out of order
- `lastPassedSurah` is correct for a returning student whose `start_surah` is not 114
- `lastPassedSurah` returns null when nothing is passed

## Explicitly out of scope

- Any change to `/teacher/roster` or to the Hifz register beyond the fix above
- Attendance, strikes, exams, or term % on this section — the roster owns those
- A class switcher on the dashboard; `/teacher/home` shows the teacher's own class, and
  `/teacher/classes` is the way to reach any other
- Term switching; the section reports the current term, matching the tiles above it
- Any new view, migration, or column
