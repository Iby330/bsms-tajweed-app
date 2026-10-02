# Handoff: Group 1's Term 1 schedule + the listen-clip branch

From the homework-remake session (2026-10-02), for the pre-launch full audit.
Nothing below has been applied to production or pushed.

## 1. Group 1 (Masjid An-Nabawi) has its own Term 1 timetable

Groups 2–4 (Al-Haram / Yunus, Al-Umawi / Abdallah, Quba / Ibrahim) are on last
year's curriculum; `SYLLABUS` in `web/src/lib/curriculum/syllabus.ts` already
says so. Group 5 (Al-Aqsa / Moadh) has no homework yet. Group 1's Term 1, from
Ibrahim (episode = lesson/homework; ordinals in brackets):

| Week (Mon) | Episodes |
| --- | --- |
| 1 · 5 Oct | Ghunna 1 (Ep 1), Ghunna 2 (Ep 2), Ṣifāt 1 (Ep 9) |
| 2 · 12 Oct | Ghunna 3–6 (Ep 3–6) |
| 3 · 19 Oct | Ghunna 7–8 (Ep 7–8) |
| 4 · 26 Oct | Ṣifāt 2–4 (Ep 10–12) |
| 5 · 2 Nov | Mudūd 1–3 (Ep 16–18) |
| 6 · 9 Nov | Ṣifāt 6–7 (Ep 14–15) |
| 7 · 16 Nov | Mudūd 4–5 (Ep 19–20) |
| 8 · 23 Nov | Ṣifāt 5 (Ep 13), Mudūd 6 (Ep 21) |

The app can't express this today. `class_item_unlock_at` (0026) opens item N
of a course in week N of the term the class takes it in — one item per course
per week, in order. What's needed (proposed, not built):

1. A table, e.g. `class_item_schedule(class_id, course_id, ordinal, week)`,
   seeded from the table above for An-Nabawi; `class_item_unlock_at` uses it
   when a row exists, else today's arithmetic (so Groups 2–5 don't change).
2. The same rule mirrored in `web/src/lib/curriculum/tree.ts`
   (`scheduledUnlockAt`, kept in step by `tree.test.ts`), the calendar topics
   (`plan.ts`) and the home page's "this week".
3. Per-class due dates: `homeworks.due_at` is one global value (week unlock +
   6 d 18 h), so Group 1's Mudūd would show a Term 3 deadline. Due = the
   class's unlock + 6 d 18 h, used by the countdown chips, home page and the
   late flag in `lib/homework/actions.ts`.
4. `SYLLABUS[1][1]` must include `sifaat_old` (it says ghunna + mudood only).
   Mirror in `class_courses`.

## 2. Pre-existing bug this depends on (fixed on a branch, not deployed)

`get_homework_for_student` still gates on the homework row's own
`weeks.unlock_at`, while the homeworks RLS (0027) uses
`sees_all_content() or can_see_content(...)`. Result: a class whose syllabus
moves a course (Group 1's Mudūd/Ṣifāt in Term 1) sees the homework in its list
but the page 404s. Fixed in **migration 0039** on branch `feat/listen-clip`
(worktree `.claude/worktrees/agent-a2d16a26e677b19ff`).

## 3. Branch `feat/listen-clip` (10 commits off origin/main, ready for review)

- `questions.media jsonb` + migration `0039_question_media.sql`: audio clips
  for "name the rule you heard" and per-option ayah audio; the student RPC
  now passes only whitelisted media keys AND uses the RLS visibility (§2).
- `recitation-clip.tsx` player; homework form + teacher screens render it.
- Tests: 1170 pass; 2 unrelated failures (import-forms reads an untracked
  guide file; a flaky review-logger timing test that passes alone). Build,
  tsc and lint on changed files clean.
- **Deploy order: apply 0039 first, then merge** — the teacher homework
  pages select `questions.media` and 404 if the column is missing.
- Awaiting Ibrahim's go-ahead for both.

## 4. Homework content state

New homework drafts live in the remake session's scratchpad and on two review
artifacts (Homework Remake, Teacher Draft Comparison). Ibrahim treats the
other teacher's draft as final with his edits applied (Ghunna 1–5, Mudūd 1–6).
Content for Group 1's weeks 1–2: Ghunna 1–6 ready-format; **Ṣifāt 1 still uses
two build-only formats (tap-the-letters, order) — must be switched before
5 Oct.** Not yet loaded into the database: blocked on Ibrahim's decision
whether to archive last year's 1,119 submissions (and reuse HW 1–21) or load
the new papers as new rows.
