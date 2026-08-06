# Course drill-down — replacing the flat Lessons and Homework lists

**Date:** 2026-07-31
**Status:** approved, in build

## Problem

`/lessons` renders every term, every week and every lesson on one page. `/homework`
renders all 28 homeworks as one undifferentiated list. Both scroll for pages, and
neither communicates that the year has structure. The app should read like a school
— you walk into a term, then into a course, then into its modules.

## Research

Hierarchical drill-down with module grouping is the settled LMS pattern (Canvas
modules, Skool's module/lesson player, Google Classroom's per-class stream). The
counter-rule is equally settled: every level of depth costs clicks, so a browsable
hierarchy needs a direct route back to *what's due now*. The design below takes the
hierarchy for browsing and keeps urgent work one click deep.

Sources: Canvas/Classroom/Skool structure comparisons; LMS navigation UX guidance
on chunking into modules and minimising click depth.

## What a "course" is

No schema change. A course is the pair `(week.term_id, lessons.series)`, derived
from rows that already exist. Courses are therefore discovered per term rather than
assumed, which matters because the year is asymmetric:

| Term | Weeks | Courses present |
|------|-------|-----------------|
| 1 | 10 | Tajweed (HW 1–10), Umm al-Kitāb (9 lessons, **no homework**) |
| 2 | 8 | Tajweed (HW 11–18) |
| 3 | 8 | Tajweed (HW 19–21), Ten Fundamental Principles (HW 101–107) |

Any design that hardcodes "each term has these courses" breaks on Terms 2 and 3.

## Routes

```
/courses                      term index
/courses/[term]               course index for that term
/courses/[term]/[series]      module list, grouped by week
/lessons/[lessonId]           unchanged — video player
/homework/[n]                 unchanged — homework form
/lessons                      permanent redirect → /courses
/homework                     reworked into a worklist
```

Nav label `Lessons` → `Courses`.

## Screens

### `/courses`

Three term cards: date range, the courses inside, progress, and a **Current term**
badge. The current term card carries one inline `this week →` line deep-linking to
the live module — the only click-saving affordance here, deliberately small because
the dashboard already owns the full "This week" section and duplicating it would
split the student's attention across two screens.

Future terms stay clickable. What they can show is constrained by RLS — see below.

## Two constraints found in the live data, after the design was agreed

Both were discovered by running the app against the real database, and both changed
the design.

### 1. Students cannot see locked content at all

The policies `s_lessons_unlocked` and `s_homeworks_unlocked` filter out every lesson
and homework whose week has not unlocked. The rows do not reach the query, so the
original plan — "locked modules render dimmed with their unlock date" — is
impossible for students. A student in Term 3 sees 4 of the 6 Tajweed modules and has
no way to know the other 2 exist.

`weeks` *is* readable. So `Term.lockedWeeks` comes from the calendar, and the copy
says only what the calendar knows:

- term card → `4 more weeks from 3 Aug`
- course page → `Week 5 unlocks 3 August, then 3 more after that.`
- homework footer → `More unlocks from 3 August.`

It deliberately never claims which *course* a locked week belongs to, because that
genuinely is not knowable from a student's session. Every module count is therefore
labelled "released", never presented as the whole course.

### 2. Most videos do not exist yet, so "complete" needed defining

`youtube_id` is null until the channel re-uploads. The first rule — a module is done
when its video is watched and its homework handed in — pinned students at 0% forever
on content they could not watch: Term 3 Tajweed showed **0 of 4** with every homework
marked 100%.

A module is now **actionable** when it has a playable video or a homework. Only
actionable modules can be done, and only they count in the denominator. A module with
neither is empty — neither complete nor outstanding — so Umm al-Kitāb reads
`9 modules released · Waiting on videos · Nothing to do here yet` rather than a green
`9 of 9 complete` for work nobody did.

### Also fixed: a live bug this restructure ran into

`(student)/home` and `(student)/lessons/[lessonId]` both fetched a week's homework with
`.eq("week_id", …).maybeSingle()`. Term 3 week 1 carries **two** homeworks (Tajweed 16
and TFP 1), so `maybeSingle()` matched multiple rows and returned nothing — the
dashboard silently showed no homework for most of Term 3, which is where the demo
calendar sits. Both now match on `series` as well, and the dashboard renders every
homework for the week.

### `/courses/[term]`

Breadcrumb, term dates and exam maximum, then one card per course with content in
that term. Each card: progress bar, module count, and a `Next: Week 7 · Verse 5` line.

### `/courses/[term]/[series]`

The module list, grouped by week:

```
Courses / Term 3 / Tajweed                     4 of 4 complete
──────────────────────────────────────────────────────────────
WEEK 1   Muduud Overview                        complete ✓
         ▸ Video coming soon   Homework 16  [Marked 100%]
WEEK 2   Mad ul Muttasil                        complete ✓
         ▸ Video coming soon   Homework 17  [Marked 93%]
──────────────────────────────────────────────────────────────
Week 5 unlocks 3 August, then 3 more after that.
```

Courses without homework render the lesson action alone — no empty slot.

Module titles are cleaned by `moduleTitle()`. Seed titles carry their own
scaffolding (`Tajweed 16: Tajweed Homework 16 : Muduud Overview`), which is noise on
a screen that already says "Tajweed" and "Week 1". Note that **two separator
conventions are live at once** — the SQL seed writes an em dash, the Forms import
writes a colon — and both are in the database today. The cleaner handles both, and
returns `""` for the TFP rows, which genuinely contain no title beyond a number.
Verified against all 37 real titles.

## Follow-up: Homework tab replaced by Progress (3 Aug)

Once homework was embedded in the course modules, the Homework tab was doing two
unrelated jobs, and only one of them was still needed:

- **"How did I do?"** — the marked list — became genuinely redundant. Those scores
  already sit on every module row, in context. A flat list of 20 was the exact thing
  this redesign set out to remove.
- **"What do I owe?"** — was *not* redundant, and Courses cannot absorb it. Overdue
  work from earlier weeks appears nowhere on Home (which shows only the current week)
  and is two clicks deep in Courses with no urgency signal above it. Live data proved
  the point: a student had four overdue TFP homeworks that no screen surfaced.

The underlying problem was that "progress" had no owner — it was smeared across Home
(stat tiles, leaderboards, hifz, strikes), Me (strikes *again*) and Homework (scores).

Each tab now has one job:

| Tab | Job |
|-----|-----|
| **Home** | What do I do now — outstanding + overdue work, then this week |
| **Courses** | Learn and browse |
| **Progress** | How am I doing — term-by-term table, exam scores, EOY, marks by term, hifz, strikes, leaderboards |
| **Hifz** | Memorisation |
| **Me** | Profile and sign-out only |

Still five tabs, so the mobile bar is unchanged, and two duplications are gone.

### Revised after user review (6 Aug)

The stripped-down Home didn't survive contact with its owner: the richer original
dashboard — leaderboards, hifz pace, strikes, stat tiles — reads better as the screen
students open every day, and the sparse to-do version lost that. Restored decisions:

- **Home is the original dashboard again** (this week, progress tiles, hifz, strikes,
  leaderboards), with two deltas kept from the redesign: the multi-homework-per-week
  fix, and a compact **Overdue** strip at the top that renders *only* when something
  from an earlier week is overdue. That strip was the one part of the to-do Home worth
  keeping — without it a student four homeworks behind sees a screen that says
  everything is fine.
- **Progress is now just the report card**: term-by-term table (homework avg, exam,
  term %, EOY footer) plus every marked homework grouped by term. Leaderboards,
  strikes and hifz pace moved back to Home and off Progress.
- Accepted duplication: current-term homework avg / term % / EOY appear as tiles on
  Home and as a table on Progress. That's fine — Home is at-a-glance, Progress is the
  breakdown.

`/homework/[n]` — where homework is actually done — is untouched; Home and Courses
deep-link straight into it. `/homework` (the index) permanently redirects to
`/progress`.

Hifz appears on Home **only when the student is behind pace**. A standing summary on
a to-do screen is a nudge people stop reading; the always-there version lives on
Progress.

### `/homework` — the interim design, now superseded

Three groups, not 28 rows:

1. **Needs you** — not started or draft, with countdown chips
2. **With your teacher** — submitted / auto_marked
3. **Marked** — approved, with scores

Every row is labelled with its term and course so it is never context-free, plus a
`Browse by course →` link into the tree.

Rationale for not mirroring the drill-down here: a student should not click three
levels deep to learn what is due this week. Browsing is hierarchical; working is flat.

## Code structure

- **`lib/curriculum/tree.ts`** — pure, no IO.
  - `buildTree(terms, weeks, lessons, homeworks)` folds flat rows into
    terms → courses → week-modules.
  - `overlayProgress(tree, watches, submissions)` layers per-student state on top.
  - Purity is the point: this is where the real risk sits (grouping, ordering, lock
    computation), and it is fully unit-testable without a database.
- **`lib/curriculum/queries.ts`** — the single server read feeding all three screens.
- **`lib/lessons/series.ts`** — extended with display order and a per-course blurb.
  Remains the single source of truth, per its existing comment.
- **New components:** `crumbs`, `term-card`, `course-card`, `module-row`.

## Testing

TDD on `tree.ts` before any page renders:

- course derivation per term (T1 = Tajweed + Umm al-Kitāb; T2 = Tajweed; T3 =
  Tajweed + TFP)
- lock computation against a fixed `now`
- progress counts, including a course with no homework
- module ordering by week number, lesson ordering by position

Existing suite must stay green. Lint and production build must pass.

## Out of scope

The teacher Curriculum page (deliberately kept as a single-page audit view so gaps
like missing rubrics stay scannable), the lesson player, the homework form, and the
database schema.
