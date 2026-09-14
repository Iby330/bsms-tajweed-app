-- ═══ Clear the part-marks the demo seeder invented ═══
--
-- `seed_demo.ts` paid a wrong answer 40% of the question's marks
-- (`Math.round(points * 0.4 * 100) / 100`), so a wrong answer on a 6-mark
-- question read 2.4. No marking path can produce that: every question is worth
-- a whole number of marks and every one now scores all-or-nothing, so a
-- fraction in `final_marks` can only have come from the seeder. The seeder is
-- fixed in the same change; this clears what it already wrote.
--
-- A fraction meant "got it wrong", so zero is the faithful translation rather
-- than a rounding.
--
-- Scope is every cohort, not just 'demo': Kareem Bassett and Nuh Ferreira are
-- seeded students reactivated into the real Masjid Al-Haram for testing (see
-- setup_demo_teacher.ts), so 58 of these rows sit in a brothers' class while
-- being the same fiction.
--
-- Guarded on `auto_marks = final_marks`: where they differ a teacher typed the
-- mark by hand, and no cleanup gets to overwrite that. Verified zero such rows
-- across all 616 before writing this — the guard is belt and braces.
--
-- Idempotent: an integer is not <> its own trunc, so a re-run matches nothing.

update answers
set final_marks = 0, auto_marks = 0
where final_marks is not null
  and final_marks <> trunc(final_marks)
  and (auto_marks is null or auto_marks = final_marks);
