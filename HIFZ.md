# Hifz — current model and the rework backlog

Working note for the hifz/hizb rework. Nothing here is a decision yet; it's a record of
how the feature works today and what's known to be wrong or missing, so the rework
doesn't start by rediscovering it. Written 2026-08-13.

---

## How it works today

**Two tables, and that's all the state there is.**

```sql
hifz_profiles (student_id pk, start_surah default 114, target_count)
hifz_records  (student_id, surah_number, passed_at, teacher_comment, marked_by,
               primary key (student_id, surah_number))
```

A student's *memorisation list* is derived, not stored: `target_count` surahs starting
at `start_surah`, walking the programme order An-Nas (114) → Al-Jinn (72), which is
`surahs.order_index` 1..43 (`lib/hifz/pace.ts` → `memorisationList`).

A sign-off is one row in `hifz_records`. There is no "unpassed" state and no history —
unmarking deletes the row.

**Everything else is computed.** Hizb and juz structure, block completion, "ready for
your check", pace against the calendar — all derived in `lib/hifz/hizb.ts` and
`lib/hifz/pace.ts` from the passed set plus the teaching-week calendar. Percentages come
out of SQL views so the formula lives in one place:

| Number | Where | Formula |
| --- | --- | --- |
| Per-student hifz % | `v_hifz_progress.pct` | `count(hifz_records) / target_count * 100` |
| Class hifz avg (teacher home) | `app/teacher/home/page.tsx` | unweighted mean of each student's `pct` |
| Pace status | `paceStatus(passed, expected)` | `expected` = fraction of teaching weeks elapsed × target, rounded **up** |

The class average is a mean of means: every student counts once regardless of how large
their target is.

---

## Known gaps

### 1. No teacher UI sets targets at all

`setStudentHifzProfile` and `setClassTarget` exist in `lib/hifz/actions.ts` and are
**called from nowhere**. There is no screen on which a teacher can set a class target or
give a returning student a different starting point. Targets only exist if they were
seeded directly into the database.

This is the load-bearing gap — most of what follows is downstream of it.

### 2. `setClassTarget` would clobber returning students

It upserts `start_surah: 114` for every student in the class. The moment a teacher sets
a class-wide target, any returning student's custom starting point is silently reset to
An-Nas, and their pace/percentage along with it. It needs to leave `start_surah` alone
for students who already have a profile, or the per-student override has to be applied
after and never before.

### 3. Targets are a surah count, but teachers think in hizbs

`target_count` is a number of surahs. A teacher setting a returning student's year says
"four hizbs" or "five hizbs" — a *portion*, not a count, and one that starts partway
through the run. Converting by hand is error-prone and the number that results is
meaningless to read back ("target: 19").

The hizb boundaries needed for that conversion already exist as `HIZB_BOUNDS` in
`lib/hifz/hizb.ts` (hizb 60 = surahs 87–114, 59 = 78–86, 58 = 72–77), so the run is
exactly hizbs 60 + 59 + 58 and ends on a boundary. A target expressed as "from hizb X,
N hizbs" is convertible to a surah range with what's already there. Worth deciding
whether the stored unit changes or only the input.

### 4. `v_hifz_progress` counts records outside the student's run

`count(hr.surah_number)` counts **every** record the student has, with no restriction to
the surahs between `start_surah` and their target. The invariant that makes this safe is
stated in a comment in `lib/hifz/hizb.ts`:

> Records only exist from the student's start_surah onward. A returning student's
> earlier surahs (done in a previous year) count as passed for every derived number.

That invariant is assumed, not enforced. Nothing in the schema or in `markSurahPassed`
prevents a record outside the current run, and `hifz_records` has no year or term column,
so records never expire. If one exists — a returning student carrying a prior year's
sign-offs, or a teacher marking ahead — the student's `pct` can exceed 100% and pull the
class average up with it.

Fix, when the rework happens: scope the numerator to the student's own run window, the
way `lastPassedSurah` in `lib/teacher/class-progress.ts` already scopes the surah *name*
it displays. Today the name is scoped and the count beside it is not, so a returning
student's row can show a surah and a count that disagree.

### 5. Teacher and student sides infer differently

The student page reconstructs prior-year surahs with `assumedPassed` — anything before
`start_surah` counts as done. The teacher's numbers do not do this; they read the raw
count from the view. The same student can therefore read as further along on their own
screen than on the teacher's. Whichever convention wins, both sides should use it.

### 6. Hizb checks aren't recorded

The check is derived from passed surahs, never stored, which is why the UI says "ready
for your check" and never "check passed". `lib/hifz/hizb.ts` names a `hizb_checks` table
as the intended teacher-side hook. Until it exists there's no record of who was tested,
when, or by whom — and a returning student's starting point is a manual guess rather
than a consequence of last year's checks.

---

## What the rework needs to settle

- The unit a target is expressed in (surah count vs hizb portion), and whether that
  changes the stored column or only the teacher's input.
- Whether prior-year progress is *recorded* (rows carried forward, or a `hizb_checks`
  history) or *inferred* (the current `assumedPassed` convention) — pick one and apply it
  on both sides.
- Whether a student's run is scoped to an academic year at all. Right now `hifz_records`
  is lifetime, which is what makes the returning-student case ambiguous everywhere it
  appears.
- The teacher screens: setting class targets, overriding a returning student, recording a
  hizb check.
