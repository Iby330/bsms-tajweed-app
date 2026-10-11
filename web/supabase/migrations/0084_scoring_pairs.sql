-- A fourth way to mark a tick-box question: a mark for every two right picks,
-- wrong picks cancel right ones, and the last mark only for the full set
-- (scoreObjective in web/src/lib/marking/objective.ts). First used by
-- Homework 2, Q8 (0085).
--
-- On its own file because a new enum value cannot be used in the transaction
-- that adds it.
alter type scoring_t add value if not exists 'pairs';
