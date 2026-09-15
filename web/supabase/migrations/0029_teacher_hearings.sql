-- ═══════════════════════════════════════════════════════════════════════
-- Teacher hearings: a revision session of kind 'hearing', tied to one
-- surah, with a verdict. Spec: docs/superpowers/specs/2026-09-15-teacher-hearing-design.md
-- Every statement idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- A hearing IS a session: same mistakes, same logger. `kind` tells the two
-- apart; existing rows default to 'peer' and satisfy every check below.
alter table revision_sessions add column if not exists kind         text not null default 'peer';
alter table revision_sessions add column if not exists surah_number int references surahs(number);
alter table revision_sessions add column if not exists outcome      text;

alter table revision_sessions drop constraint if exists revision_sessions_kind_check;
alter table revision_sessions add constraint revision_sessions_kind_check
  check (kind in ('peer', 'hearing'));

alter table revision_sessions drop constraint if exists revision_sessions_outcome_check;
alter table revision_sessions add constraint revision_sessions_outcome_check
  check (outcome is null or outcome in ('passed', 'not_passed'));

-- A hearing names its surah; a peer session never does.
alter table revision_sessions drop constraint if exists revision_sessions_hearing_surah_check;
alter table revision_sessions add constraint revision_sessions_hearing_surah_check
  check ((kind = 'hearing') = (surah_number is not null));

-- Only a hearing carries a verdict.
alter table revision_sessions drop constraint if exists revision_sessions_peer_no_outcome_check;
alter table revision_sessions add constraint revision_sessions_peer_no_outcome_check
  check (kind = 'hearing' or outcome is null);

create index if not exists idx_revision_sessions_hearing
  on revision_sessions (reciter_id, surah_number) where kind = 'hearing';

-- The pass points at the hearing that produced it. Null for passes made
-- before this migration, or made from the register without a hearing.
alter table hifz_records add column if not exists session_id uuid references revision_sessions(id) on delete set null;

-- ── RLS ────────────────────────────────────────────────────────────────
-- Teachers already read every session and mistake (t_sessions_read,
-- t_mistakes_read). The reviewer policies on update / mistake insert /
-- mistake delete key on reviewer_id = auth.uid() with no role check, so
-- they admit a teacher reviewer as they stand. What a teacher lacks is the
-- INSERT on sessions, which students get only through an active pair.
drop policy if exists t_sessions_insert on revision_sessions;
create policy t_sessions_insert on revision_sessions for insert
  with check (is_teacher() and reviewer_id = auth.uid() and kind = 'hearing');

-- A student can never create a hearing: the peer insert now says so.
drop policy if exists s_sessions_insert on revision_sessions;
create policy s_sessions_insert on revision_sessions for insert
  with check (
    reviewer_id = auth.uid()
    and kind = 'peer'
    and exists (
      select 1 from revision_pairs p
      where p.active
        and ((p.student_a = reviewer_id and p.student_b = reciter_id)
          or (p.student_b = reviewer_id and p.student_a = reciter_id))
    )
  );
