# Homework redo below 60% — design

Date: 2026-09-15. Branch: `feat/teacher-hearings`.

## The rule

When a teacher approves ("releases") a homework submission and the mark is
**below 60%** of the homework's `total_marks`, the submission is sent back
for a redo, automatically, as part of that same approval. The student gets a
blank paper and has to answer every question again. This repeats until an
approved attempt reaches 60% or more. There is no cap on attempts.

Exactly 60% passes. "Less than 60" is the trigger.

## What each side sees

**Student, failed attempt.** Their percentage and the fact that they must
redo. Not their answers, not the per-question marks, not the AI rubric chips,
not the teacher's comments. A four-option multiple choice plus per-question
marks is a guessing game; withholding both is what makes the redo a redo.

**Student, passing attempt.** Exactly what they see today: total, per-question
mark badges, their own answers read-only, rubric chips, teacher comments.
Never the answer key — `get_homework_for_student` strips it and nothing here
changes that.

**Student, home page.** The "needs you" box under the greeting (the Overdue
box) now lists redos alongside overdue homework. Redos are listed first. The
box's heading reads "Redo" when only redos are pending, "Overdue" when only
overdue work is, and "Needs you" when both. The masthead's "One thing needs
you" counts both kinds. A redo row's sub-line reads
`Redo · scored 45% · Tajweed · week 3`. A redo never appears twice (it is
removed from the overdue list if it would also qualify there).

**Student, homework page.** A draft on attempt 2+ shows a notice above the
form: "Redo — you scored 45% last time and need 60%. Answer every question
again; your earlier answers are not shown." No countdown chip (the original
deadline has passed and a redo is never late). Once handed in, the usual
"Submitted — your teacher will release your mark shortly" line.

**Student, elsewhere.** Wherever a draft shows a "Draft" chip (progress rows,
course module cards), a redo draft shows a "Redo" chip in the danger tone.

**Teacher, per-homework list.** A student whose current attempt is a redo
draft shows as `redo pending · scored 45%` rather than `not submitted`, and
is not counted as handed in. Once they hand the redo in, the row behaves like
any submission.

**Teacher, marking screen.** The header carries `attempt 2` next to `late`.
Above the review panel, a "Previous attempts" section lists each superseded
attempt (attempt number, percentage, who released it and when) with the
old script expandable read-only: prompt, the student's answer (text, or the
option values they picked), the mark it got, and any comment. Old
recordings are playable. This is the only place old answers are visible.

**Teacher, approving.** Nothing new to press. After "Approve and release" the
teacher lands back on the list as before; if the mark fell below 60% the
list now shows that student as redo pending. Editing marks on an approved
submission and saving a total below 60% also triggers a redo.

## Which mark counts

The current attempt only. While a redo is open the student has no approved
submission for that homework, so `v_hw_pct`, term averages and leaderboards
simply do not include it — same as a homework not yet marked. When the redo
is approved at 60%+, that mark is the one that counts. No cap on the redo's
mark; add one later if gaming appears.

## Data model

One live `submissions` row per (homework, student) — the unique constraint
stays, so nothing that reads "the student's submission" changes shape.

`submissions` gains:

- `attempt int not null default 1`
- `previous_pct numeric` — the percentage of the attempt most recently sent
  back. Non-null iff `attempt > 1`.

New table `submission_attempts`: a snapshot of each superseded attempt.

| column | note |
| --- | --- |
| id uuid pk | |
| submission_id uuid → submissions on delete cascade | the live row it belongs to |
| homework_id, student_id | copied for cheap teacher queries |
| attempt int | the attempt number this snapshot was |
| pct numeric | the mark that failed |
| is_late, submitted_at, approved_by, approved_at | copied from the live row |
| answers jsonb | `[{question_id, response, auto_marks, auto_rubric, final_marks, teacher_comment}]` |
| voice_notes jsonb | `[{question_id, storage_path, duration_s}]` |
| superseded_at timestamptz default now() | |
| unique (submission_id, attempt) | |

RLS: enabled; one policy, teachers read (`is_teacher()`). Students have no
policy on it at all, which is the requirement.

Storage: voice files are NOT deleted. The snapshot keeps their paths so the
teacher can replay an old recitation. Only the `voice_notes` rows go.

### `open_homework_redo(sub_id uuid, failed_pct numeric) returns int`

`security definer`, `revoke execute … from public, anon, authenticated` —
only the service-role client may call it. In one transaction:

1. `select … for update` the submission; raise if not `approved`.
2. Insert the snapshot row (answers and voice notes aggregated to jsonb).
3. Delete the submission's `answers` and `voice_notes`.
4. Update the submission: `status = 'draft'`, `attempt = attempt + 1`,
   `previous_pct = failed_pct`, `submitted_at`, `approved_by`,
   `approved_at` null, `is_late = false`.
5. Return the new attempt number.

## Trigger

In `approveSubmission`, after the final marks are written and the row is
approved:

```
verdict = redoVerdict(finalMarksByQuestion, questions, homework)
```

`redoVerdict` is pure and lives in `src/lib/marking/redo.ts`:

- returns `null` (no verdict, nothing happens) when the homework is not
  graded, `total_marks` is 0, the submission carries `imported_marks`, or
  there are no answers at all;
- otherwise `{ pct, redo: pct < 60 }` where `pct` is the sum of final marks
  on non-bonus questions still on the paper, over `total_marks`, times 100 —
  the same arithmetic as `v_hw_pct`.

`REDO_THRESHOLD_PCT = 60` is exported from the same module.

When `redo` is true the action calls `open_homework_redo` via the admin
client and revalidates `/home`, `/progress` and `/homework/<number>`. The
action returns `{ pct, redo }` so the review panel can route: after an edit
that triggers a redo it goes back to the list rather than staying on a page
that is now an empty draft.

## Out of scope

Capping a redo's mark; a deadline on redos; a teacher-initiated "send back"
button; notifying students by email.
