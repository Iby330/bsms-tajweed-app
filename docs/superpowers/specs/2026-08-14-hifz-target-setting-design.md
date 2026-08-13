# Hifz target-setting — design

Approved 2026-08-14. Lets teachers set memorisation targets from the hifz section:
a class-wide default on the register, a per-student override (start + target) on the
student detail page. Closes items 1 and 2 of HIFZ.md.

## Decisions (user-confirmed)

- **Class default + per-student override.** The register applies a default to every
  student without a custom target; the detail page sets one student individually.
- **Presets are whole hizbs; custom is an end surah.** Preset chips derive from the
  hizb boundaries ("To end of Hizb 60 · 28 surahs", "+ Hizb 59 · 37", "Full run · 43");
  Custom opens a picker of surahs in memorisation order — "memorize up to ___" — and
  the surah count is derived, never typed.
- **The per-student form sets start AND target.** A returning student starts partway
  through the run (`start_surah` already exists); presets and counts re-derive from
  the chosen start. The class default never touches `start_surah`.

## Data

One migration (`0012_hifz_target_setting.sql`):

```sql
alter table hifz_profiles add column if not exists is_custom boolean not null default false;
update hifz_profiles set is_custom = true where start_surah <> 114;
```

`is_custom` is what makes the two tiers real: the class default writes only
non-custom rows, so re-applying it (or raising it mid-year) never tramples a
returning student or an individually-set target. Rows with a non-default start are
backfilled as custom — they can only have been set by hand. No unit change:
`target_count` stays a surah count; hizbs are an input vocabulary, not a stored one.

## Pure logic — `lib/hifz/targets.ts`

Built on `HIZB_BOUNDS` + `memorisationList`; no DB, no React; TDD.

- `targetPresets(startSurah, surahs)` → `{ hizb, endSurah, count, label }[]` — one
  option per hizb whose end lies at or after the start, counting from the start.
  For start 114: Hizb 60 → 28, Hizb 59 → 37, Hizb 58 → 43. For a mid-run start the
  list shrinks and re-counts ("Finish Hizb 60 · …").
- `countTo(startSurah, endSurah, surahs)` → number | null — surahs from start to end
  inclusive in memorisation order; null when either is missing or end precedes start.

## Server actions — rework the two orphans in `lib/hifz/actions.ts`

- `setClassTarget(targetCount)` — resolves the teacher's own class via
  `teacherClass()` (no caller-supplied classId), reads which roster students have
  `is_custom` profiles, and batch-upserts `{start_surah: 114, target_count,
  is_custom: false}` for the rest in one statement (the old version looped upserts
  and clobbered `start_surah` for everyone).
- `setStudentHifzProfile(studentId, startSurah, targetCount)` — verifies the student
  is in the teacher's roster, validates the target fits between the start and the end
  of the run (`memorisationList` length), upserts with `is_custom: true`.

RLS already allows this (`t_hifz_profiles` for all to `is_teacher()`); the roster
check is scoping, not security.

## UI

- **Register (`/teacher/hifz`)** — a "Class target" glass card above the list:
  preset chips, "Custom…" revealing the end-surah select, and an apply button that
  states its blast radius — "applies to 14 students · 6 custom targets kept". The
  list below already shows each student's resulting target.
- **Detail (`/teacher/hifz/[studentId]`)** — a "Target" card under the pace marker:
  starts-at select, preset chips relative to that start, end-surah select constrained
  to at-or-after the start, current values pre-filled, one save button. Marks the
  student custom.

Both are client components (`class-target-form.tsx`, `student-target-form.tsx`)
following the `HifzMarker` idiom: `useTransition`, server action, `router.refresh()`.

## Verification

Vitest on `targets.ts` (boundary counts, mid-run starts, invalid ranges), tsc,
`next build`, regenerate `database.types.ts` via the Management API (LEARNINGS:
no CLI; stale types surface as SelectQueryError at property access). Push to main
only after all pass.

## Out of scope (stays in HIFZ.md)

Scoping `v_hifz_progress` to the run window, recording hizb checks, year scoping
of `hifz_records`, teacher/student `assumedPassed` disagreement — all wait for the
hizb rework.
