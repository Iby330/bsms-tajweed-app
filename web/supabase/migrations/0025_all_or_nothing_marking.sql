-- ═══ Machine-marked questions are all-or-nothing ═══
--
-- Twelve checkbox questions scored `per_option`: one mark per correct tick,
-- wrong ticks cancelling, mirroring how Google Forms behaved. The flaw is that
-- a question's total comes from the gradebook and not from counting its
-- options, so the two rarely divide: 2 marks across 5 correct options paid 0.4
-- a tick, and a teacher opening a script read 1.6 out of 2. A homework mark is
-- whole. They got the question or they did not.
--
-- The rule change alone would leave the marks already written untouched —
-- `answers.final_marks` is a stored number, not a derived one — so the
-- re-score runs in execution/rescore_exact.ts straight after this, using the
-- real `scoreObjective` rather than a second copy of the rule in SQL.
--
-- Everything downstream IS derived and needs nothing: v_hw_pct sums
-- final_marks live, and the term average, the end-of-year figure and both
-- leaderboards are built on top of that view.
--
-- Safe to re-score: not one of the 217 answers on these questions carries a
-- teacher override (final_marks = auto_marks on every row) or a comment, so
-- no human judgement is being overwritten — only the arithmetic.
--
-- Idempotent: re-running matches nothing once the twelve are 'exact'.

update questions
set scoring = 'exact'
where scoring = 'per_option'
returning id, homework_id, position, points;
