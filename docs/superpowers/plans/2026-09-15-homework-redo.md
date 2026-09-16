# Homework redo — implementation plan

Spec: `docs/superpowers/specs/2026-09-15-homework-redo-design.md`. Read it first.
All paths below are relative to `web/` unless they start with `execution/`.

Conventions in this repo: comments explain *why*, in full sentences; pure
logic lives in `lib/` with vitest tests beside it; server actions are
`"use server"` files that export only actions; every migration statement is
idempotent. `npm test`, `npx tsc --noEmit` and `npm run lint` must stay green.

## Task 1 — schema

**`supabase/migrations/0030_homework_redo.sql`** (new). Header comment in
the house style (see `0029_teacher_hearings.sql`), pointing at the spec.

- `alter table submissions add column if not exists attempt int not null default 1;`
- `alter table submissions add column if not exists previous_pct numeric;`
- `create table if not exists submission_attempts (...)` per the spec table,
  with `unique (submission_id, attempt)` and an index on `(homework_id, student_id)`.
- `alter table submission_attempts enable row level security;`
- `drop policy if exists t_attempts_read on submission_attempts;`
  `create policy t_attempts_read on submission_attempts for select using (is_teacher());`
- `create or replace function open_homework_redo(sub_id uuid, failed_pct numeric) returns int language plpgsql security definer set search_path = public as $$ ... $$;`
  exactly the five steps in the spec. Raise `exception 'Submission % is not approved', sub_id` when the status is not `approved`.
- `revoke execute on function open_homework_redo(uuid, numeric) from public, anon, authenticated;`

Apply it: from the repo root, `npx tsx execution/apply_migration.ts web/supabase/migrations/0030_homework_redo.sql`.
Then confirm with `--probe "select column_name from information_schema.columns where table_name='submissions'"`.

**`src/lib/database.types.ts`**: hand-edit, matching the generated style exactly.
- `submissions` Row/Insert/Update: add `attempt: number` (Insert/Update optional) and `previous_pct: number | null`.
- Add table `submission_attempts` (Row/Insert/Update/Relationships) between `strikes` and `submissions` alphabetically. Relationships: `submission_attempts_submission_id_fkey` → `submissions`, `submission_attempts_homework_id_fkey` → `homeworks`, `submission_attempts_student_id_fkey` → `profiles`, `submission_attempts_approved_by_fkey` → `profiles`.
- Functions: `open_homework_redo: { Args: { sub_id: string; failed_pct: number }; Returns: number }`.

## Task 2 — pure logic and tests

**`src/lib/marking/redo.ts`** (new):

```ts
export const REDO_THRESHOLD_PCT = 60;
export type RedoVerdict = { pct: number; redo: boolean };
export function redoVerdict(
  finalMarks: { question_id: string; final_marks: number | null }[],
  questions: { id: string; is_bonus: boolean }[],
  homework: { total_marks: number; is_graded: boolean },
  submission: { imported_marks: number | null },
): RedoVerdict | null
```
Null when not graded, `total_marks <= 0`, `imported_marks` non-null, or
`finalMarks` empty. Otherwise sum `final_marks ?? 0` over answers whose
question is on the paper and not bonus; `pct = sum / total_marks * 100`;
`redo = pct < REDO_THRESHOLD_PCT`. Tests in `redo.test.ts`: 59.9 → redo,
60 → not, bonus marks lift over the line, deleted question ignored,
each null case.

**`src/lib/curriculum/tree.ts`**: add
```ts
export type RedoInfo = { attempt: number; previousPct: number | null };
```
`StudentProgress` gains optional `redoByHomeworkId?: Map<string, RedoInfo>`.
`Module` and `HomeworkEntry` gain `redo: RedoInfo | null` (buildTree sets
`null`; `overlayProgress` fills it from the map; `listHomework` copies it).
Existing `tree.test.ts` fixtures must still pass; add one test that a
module with a redo entry carries it through `listHomework`.

**`src/lib/homework/logic.ts`**:
- `statusChip(status, redo?: { attempt: number } | null)`: when
  `status === "draft"` and `redo && redo.attempt > 1` → `{ label: "Redo", tone: "danger" }`.
  Add `"danger"` to `ChipTone`. Tests.
- New pure helper for the home hero:
  ```ts
  export type AttentionKind = "redo" | "overdue";
  export function attentionList<T extends { homework: { id: string } }>(
    overdue: T[], redos: T[],
  ): { kind: AttentionKind; entry: T }[]
  ```
  Redos first, then overdue entries not already listed as a redo. And
  `attentionHeading(items): "Redo" | "Overdue" | "Needs you"`. Tests.
- `redoNotice(previousPct: number | null): string` → `"You scored 45% last time and need 60%."` (rounded; when null: `"You need 60% to pass this homework."`). Test.

## Task 3 — teacher side

**`src/lib/marking/actions.ts`** `approveSubmission`: change the return type to
`Promise<{ pct: number | null; redo: boolean }>`. Read, alongside the answers
(same `Promise.all`), the submission (`attempt, imported_marks, homework_id,
student_id`) and then the homework (`number, total_marks, is_graded`) with its
questions (`id, is_bonus`). After the existing approve update, compute
`redoVerdict` from the planned final rows joined to `question_id` (answers
carry `question_id`; `planFinalMarks` rows carry `id` and `final_marks`). If
`redo`, `await db.rpc("open_homework_redo", { sub_id: submissionId, failed_pct: pct })`
and throw on error; revalidate `/home`, `/progress`, `/homework/${number}`.
Update the doc comment.

**`src/components/app/review-panel.tsx`**: use the result. `if (approved && !result.redo)` stay and refresh; otherwise `router.push(backHref); router.refresh()`.

**`src/components/app/past-attempts.tsx`** (new, server component, no `"use client"`):
```ts
export function PastAttempts({ attempts, questions }: {
  attempts: { attempt: number; pct: number | null; approved_at: string | null;
              approver: string | null; is_late: boolean; answers: unknown; voice_notes: unknown }[];
  questions: ReviewQuestion[];   // from review-panel
})
```
Renders nothing for an empty list. Otherwise a `box c12` headed
"Previous attempts", one `<details>` per attempt (newest first) whose
summary reads `Attempt 1 · 45% · released 3 Sep by Ustadh X`, and inside,
per question in position order: the prompt via `MixedText`, the student's
answer (text via `textOf`; options: the `value` of each picked position;
tap-words: `TapWords … readOnly reveal`), `final_marks / points`, and the
teacher comment if any. Tasks render `VoicePlayback` when the snapshot has a
path. Parse the jsonb defensively (bad shape → "No answers recorded").

**`src/app/teacher/homework/submission/[submissionId]/page.tsx`**: add
`attempt, previous_pct` to the select, and a second read of
`submission_attempts` for this submission ordered by `attempt desc`, with
`profiles!submission_attempts_approved_by_fkey(full_name)` for the approver.
Header: `attempt {n}` chip (muted) when `attempt > 1`, beside `late`.
Render `<PastAttempts>` above `<ReviewPanel>`.

**`src/app/teacher/homework/[number]/page.tsx`**: read all live submissions
for the roster (drop the `.in("status", …)` filter; add `attempt, previous_pct`
to the select). Derive `subs` = those with status not `draft` so every
existing use is unchanged. Build `rows` with a new state: a draft with
`attempt > 1` → `state: "redo"`, `pct: previous_pct`. A plain draft stays
`missing`. Picker label for redo: `${name} · redo pending`.

**`src/components/app/results-summary.tsx`**: `SummaryRow.state` gains
`"redo"`; `STATE_LABEL.redo = "redo pending"`; the row renders as a
non-link like `missing` but not faded, showing `scored 45%` in the danger
tone where the marks would be. The handed-in count excludes it (treat like
missing wherever `missing` is special-cased).

## Task 4 — student side

**`src/lib/curriculum/queries.ts`** `getStudentCurriculum`: select
`homework_id, status, attempt, previous_pct` from submissions; build
`redoByHomeworkId` for rows with `attempt > 1` and pass it in `progress`.
Also expose it on the return value.

**`src/app/(student)/home/page.tsx`**: `redos = buckets.needsYou.filter(e => e.redo && e.submission === "draft")`
(a redo already handed in is with the teacher, not on the student's plate).
`items = attentionList(overdue, redos)`. The box heading uses
`attentionHeading(items)`; the count and the masthead label use
`items.length`. A redo row's sub-line: `Redo · scored {Math.round(previousPct)}% · {seriesShort} · week {n}`
(omit the score part when `previousPct` is null). Keep the `.s.bad` class.

**`src/app/(student)/homework/[n]/page.tsx`**: select `attempt, previous_pct`
on the submission. When `sub.attempt > 1 && sub.status === "draft"`, render
before the form:
```tsx
<div className="field see-through"><section className="box c12 needs">
  <span className="label" style={{ color: "var(--danger)" }}>Redo</span>
  <p ...>{redoNotice(sub.previous_pct)} Answer every question again — your earlier answers are not shown.</p>
</section></div>
```
Hide the `CountdownChip` whenever `attempt > 1`. Add `· redo` to the meta
label line when `attempt > 1`.

**`src/components/app/homework-row.tsx`**: when `entry.submission === "draft"`
and `entry.redo`, render `<span className="chip bad">Redo</span>` instead of
the Draft chip. (`chip bad` already exists — see the pct chip above it.)

**`src/components/app/module-card.tsx`**: pass `m.redo` to `statusChip`; map
`tone === "danger"` to `bg-danger/12 text-danger`.

## Task 5 — verify

`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` in `web/`.
Then commit only the files this work touched (never `-A`).
