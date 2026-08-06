# Student Hifz Journey — design

**Date:** 2026-08-06
**Scope:** student `/hifz` page only. Teacher side deliberately untouched (deferred to a
later "teacher experience" pass across the whole app).

## Problem

The student hifz page is a pace tick-bar plus a flat surah checklist. It reads as dead:
no sense of journey, no context about the surahs, no acknowledgement of the programme's
actual structure (hizb checks). Goal: make the page feel alive and motivating while
staying a **read-only mirror of teacher marks** — no new student interactions, no
database changes.

## Decisions made (with the user)

1. **Read-only, but beautiful** — presentation upgrade only; teacher marking stays the
   sole source of truth.
2. **Tone: middle ground** — dignified base (Arabic typography, quiet colour), a few
   tasteful game-adjacent elements (milestone moments, a completion banner). No points,
   badges, streaks, or confetti.
3. **Direction: Journey Path** (Duolingo's path metaphor, dignified execution) with a
   hero strip on top, a clean path in the middle, and a "Your record" section below.
4. **Hizb layer** — the programme runs hizb checks: after finishing every surah in a
   hizb, the student presents the whole hizb to the teacher in one sitting, then starts
   the next hizb. Boundaries follow the **standard mushaf division** (verified):
   - **Hizb 60** = surahs 87–114 (Al-A'la → An-Nas) — 28 surahs
   - **Hizb 59** = surahs 78–86 (An-Naba → At-Tariq) — 9 surahs
   - **Hizb 58** = surahs 72–77 (Al-Jinn → Al-Mursalat) — 6 surahs
   The BSMS run (order_index 1–43, An-Nas backwards to Al-Jinn) is exactly these three
   hizbs, ending on a hizb boundary.
5. **Headline count is juz-framed, not target-framed** — "Juz 'Amma · 12 of 37 surahs",
   not "12 of 20" against the yearly `target_count`. The target still drives pace
   (unchanged `expectedPassed`), it just isn't the headline number.

## Data layer (no DB changes)

New file `web/src/lib/hifz/hizb.ts` — pure functions + static constants, unit-tested
with vitest alongside `pace.test.ts`:

- `HIZB_BOUNDS`: the three ranges above, plus juz mapping (Juz 30 "'Amma" = 78–114,
  Juz 29 "Tabarak" = 67–77). Keyed by surah `number`.
- `hizbOf(surahNumber)` / `juzOf(surahNumber)`.
- `assumedPassed(allSurahs, list, passedSet)` → the record set plus every surah before
  the student's start point. Unconditional by design: any student whose `start_surah`
  isn't 114 is treated as having passed everything above it (returning students did it
  in a previous year; there is no override for mid-year joiners or data-entry slips).
  All derived numbers below use this set; the path itself only shows this year's list.
- `hizbBlocks(allSurahs, assumedSet)` → ordered blocks `{ hizb, surahs, passedCount,
  state }` where state ∈ `complete | current | upcoming`. Computed over the FULL run,
  not the student's list — the hero bars always show all three blocks, and blocks
  before a returning student's start point render full.
- `checkStatus(blocks, earnedSet)` → the hero footer line: `toGo` (surahs remaining in
  the current block, counted over the canonical run independent of `target_count` — a
  student whose yearly target ends mid-hizb still sees the true distance), `ready`
  (block finished, next untouched), or `done`. `earnedSet` is this year's REAL records,
  not the assumed set: `ready` requires at least one earned pass in the finished block,
  so a returning student is never told to re-present last year's check. Required param
  by design — the compiler enforces the distinction.
- `juzProgress(allSurahs, list, assumedSet)` → `{ juz, name_en, name_ar, passed, total }` for the juz
  the current surah sits in. **Denominator = surahs of that juz within the memorisation
  run**: 37 for Juz 'Amma (whole juz is in-run), 6 for Juz Tabarak (run covers only
  hizb 58; surahs 67–71 are hizb 57, outside the programme).

New file `web/src/lib/hifz/surah-meta.ts` — static record for surahs 72–114:
`{ ayahCount, meaning }` (e.g. 112 → 4 ayahs, "The Sincerity"). Static Qur'anic facts,
no DB table. Used by hero and current-surah node.

Existing `pace.ts` (`expectedPassed`, `paceStatus`, `memorisationList`) unchanged.

## Page structure — `web/src/app/(student)/hifz/page.tsx`

Server component throughout except where noted. Existing visual language (rounded-lg
bordered cards, `bg-card`, muted palette, `ok/warn/danger` tokens, `ar-ui` Arabic class).

### 1. Hero strip (new component `hifz-hero.tsx`)

- Left: "NOW MEMORISING" label; current surah in large Arabic (`سُورَةُ الإِخْلَاص`
  style); English name · meaning · ayah count.
- Right: progress ring (conic-gradient, no JS) showing juz progress, e.g. **12/37**;
  beside it "Juz 'Amma عمّ — **12 of 37** surahs" and the existing pace chip
  (ahead / on pace / behind, same `paceStatus` logic).
- Below: **hizb blocks** — three segmented horizontal bars, width proportional to
  surah count (28/9/6), filled to each block's passed count, labelled
  "Hizb 60 · 12/28" etc. Blocks before a returning student's start point render full.
- Footer line: "**16 surahs** until your **Hizb 60 check** — presenting the whole hizb
  to your teacher." When the current block is fully passed:
  "**Ready for your Hizb 60 check** ◆". When target complete: "Target complete —
  masha'Allah."

### 2. Journey path (new component `hifz-journey.tsx`)

Replaces the flat checklist. Grouped by hizb block, section label per group
("HIZB 60 — AN-NAS TO AL-A'LA"). Node types, top to bottom:

- **Passed**: small filled circle (✓), name + Arabic, pass date right-aligned, small 💬
  mark if a teacher comment exists (the comment itself lives in Your record, not here).
- **Current**: large ringed node with the Arabic name inside, "— you are here", meaning
  + ayah count beneath. Nodes wind with a gentle alternating horizontal offset
  (CSS only).
- **Expected-pace marker**: dashed amber circle inserted at index `expectedPassed - 1`
  in the run: "class pace is here — {surah}". Omitted when expected = 0 or when it
  would coincide with the current node.
- **Upcoming**: ghosted outline nodes. Runs of >4 upcoming nodes within a block
  collapse to first node + "… N more surahs" + last node before the milestone.
- **Hizb check milestone** (between blocks): dashed gold card — "Hizb 60 check ·
  Present the whole hizb to your teacher in one sitting — then Hizb 59 begins."
  States: upcoming (dashed, muted), **ready** (filled gold accent, "Ready for your
  Hizb check ◆") when every surah in the block is passed, passed-through (quiet solid,
  ✓) once any later surah is passed.
- **Completion**: final milestone card "Target complete — masha'Allah." shown filled
  when everything is passed.
- Future hizb blocks render collapsed to their section label + surah count
  (e.g. "Hizb 59 — At-Tariq to An-Naba · 9 surahs"), expanded automatically once the
  block becomes current. Not interactive in v1.

**Derived-milestone honesty rule:** the hizb check is not recorded in the DB. The UI
therefore says "ready for your check", never "check passed". A `hizb_checks` table +
teacher marking UI is an explicit future hook (teacher-experience pass); the milestone
card then gains a real date.

### 3. Your record (new component `hifz-record.tsx`)

Implemented with a native `<details>` element (no client JS) unless styling forces a
small client component.

- Card titled "Your record". Collapsed: the **2 most recent** passes. Expanded via
  "Show all N ▾": the full list, **most-recent-first** in both states.
- Each entry: name + Arabic, "passed {date}", teacher comment in a soft quoted block
  when present. This is the one place comments appear in full.
- Hidden entirely when nothing is passed yet.

### Edge cases

- **No hifz profile**: existing "teacher hasn't set your target" card, unchanged.
- **Nothing passed yet**: hero shows 0-state ring and first surah as current; path all
  ghosted; record hidden; footer shows full distance to first check.
- **Returning student** (`start_surah` mid-run): earlier blocks render complete-by-
  default in the hero bars; the path starts at their list start (as today).
- **Target ends mid-hizb**: path and check-distance still show the true hizb boundary;
  the completion milestone sits at the end of *their* list.
- **Weeks not seeded / expected = 0**: pace chip and marker omitted, rest unaffected.

### Unchanged elsewhere

`PaceMarker` component stays (used by student home and teacher hifz detail) — this
page just stops importing it. Teacher pages, queries, RLS, schema: untouched.

## Testing

- Unit (vitest): `hizb.ts` — block computation (fresh + returning student), check
  distance (incl. target-ends-mid-hizb), juz progress denominators (37 / 6), boundary
  correctness (87/78/72), ready-state detection.
- Manual: seeded demo student on `/hifz` — hero numbers, marker position, milestone
  states, record collapse/expand, mobile width (390px), empty states.

## Out of scope (explicit)

Student interactivity (revision logging, audio), streaks/badges, `hizb_checks` table,
teacher-side hizb UI, changes to marks/progress pages, animation beyond simple CSS
transitions.
