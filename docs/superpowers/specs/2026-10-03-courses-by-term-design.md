# Courses by term — design

Status: agreed with the programme lead, 2026-10-03.

## Why

Since 0043–0053 every class has its own plan (which course in which term, and
for Group 1 a week-by-week timetable). The student Courses index still shows
one flat set of course tiles for the year plus "The rest of the programme",
which mixes *courses this class takes later* with *courses this class never
takes*. Students should see their year the way it is taught: Term 1, Term 2,
Term 3, and separately what the programme holds beyond their plan.

## The page (`/courses`)

**1. Three term tiles, in order.** Each tile is the reader's own term, from
their tree (`getStudentCurriculum`), so it follows their class's plan and
their section's calendar.

- Header: "Term N" and its dates (`terms.starts_on`–`ends_on`).
- Body: the names of the courses the class takes that term, in plan order.
- **Open term** (any module in it has unlocked for the reader): the tile links
  to `/courses/N`, shows progress ("4 of 21 modules done") and "Current term"
  when `isCurrent`. Each course name inside it is its own link straight to
  `/courses/N/<series>` — **only when that course has an unlocked module for
  the reader.** A course in the open term that has not started yet (e.g.
  An-Nabawi's Mudūd before week 5) or has no content (Ṣifāt series,
  Makhārij series, Qāʿidah) is plain text, not a link.
- **Term not yet open**: not a link at all. Shows a lock and "Opens <date>",
  the date being the first unlock among the term's modules for this reader
  (so a sister sees her Wednesday). Course names are listed as plain text.
- **Term with no courses planned** (e.g. Term 3 for Al-Aqsa and Hareer):
  shown exactly like a locked term with no course names — dates, a lock and
  "Opens <date>", the date being the term's first week unlock on the reader's
  section calendar. It never says that nothing is planned. Not a link.

**2. "Rest of the programme"**, below the terms: only courses that appear in
no term of the reader's plan. Locked tiles with name and cover, never links —
the same `CourseTile` with `href={null}` as today. Courses the class takes in a
later term no longer appear here; they are named in that term's tile.

Examples (2026/27): An-Nabawi and Zukhruf see Umm al-Kitāb and Qāʿidah;
Al-Haram, Al-Umawi, Quba and Salsabeel see Ṣifāt series, Makhārij series and
Qāʿidah (Rayyan also Mabādi'); Al-Aqsa and Hareer see nearly everything else.

A reader with no syllabus (demo cohorts) or `unlock_all` keeps today's
behaviour inside each term (their tree is the whole programme); their "rest"
is empty.

## Unchanged

The term page `/courses/[term]` and course page `/courses/[term]/[series]`
(reached directly by URL, a not-yet-open course renders with its weeks
locked and nothing playable: RLS withholds the rows), Home and its "this week"
links, calendars, homework pages, and every teacher screen.

## Shape of the change

- `courseIndex` in `lib/curriculum/catalogue.ts` is replaced (or joined) by a
  pure `termIndex(terms, catalogue)` returning, per term: dates, open/locked,
  opens-at, progress, and its courses each with `href | null`; plus the
  `rest` tiles. Unit-tested against fixtures for An-Nabawi, a middle class,
  Al-Aqsa and a sisters' class, including: no link for a not-yet-started
  course in the open term, no link for an empty course, no link anywhere in a
  locked term, and an empty term reading only "Opens <date>".
- A `TermTile` component; `courses/page.tsx` renders three `TermTile`s and the
  rest. House styles (`cards`, `box`, `Rule`), no new design language.
- Security does not depend on the tile: RLS already withholds unopened
  lesson and homework rows, so a typed URL shows locked weeks, never content.
