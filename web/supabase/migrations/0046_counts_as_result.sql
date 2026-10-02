-- ═══════════════════════════════════════════════════════════════════════
-- Simple hearing: marks save at once, results are a separate step.
-- Spec: docs/superpowers/specs/2026-10-02-hifdh-hear-simple-design.md
-- Every statement idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- A hearing session either carries a result (the teacher confirmed a range
-- in the Pass / Not passed popup) or only marks (the Hear tab's day of taps
-- for one student). Only a result decides "not passed": a surah must never
-- turn red because a mistake was marked on it. Every existing session ended
-- with a confirmed range, so the default keeps them all results.
alter table revision_sessions add column if not exists counts_as_result boolean not null default true;

-- A marking session is created already submitted, so the student sees each
-- mark at once. The reviewer policies on revision_mistakes (0013) admit
-- writes only while a session is a draft, so a teacher gets their own
-- write path into their own marking sessions, and into nothing else:
-- a submitted result session stays closed to edits as before.
drop policy if exists t_mistakes_marking_insert on revision_mistakes;
create policy t_mistakes_marking_insert on revision_mistakes for insert
  with check (is_teacher() and exists (
    select 1 from revision_sessions s
    where s.id = session_id and s.reviewer_id = auth.uid()
      and s.kind = 'hearing' and not s.counts_as_result));

drop policy if exists t_mistakes_marking_delete on revision_mistakes;
create policy t_mistakes_marking_delete on revision_mistakes for delete
  using (is_teacher() and exists (
    select 1 from revision_sessions s
    where s.id = session_id and s.reviewer_id = auth.uid()
      and s.kind = 'hearing' and not s.counts_as_result));
