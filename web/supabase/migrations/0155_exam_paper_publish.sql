-- 0155 — Exam Builder: publish a paper so other teachers can work on it.
--
-- Owner's calls (2026-11-24):
--   * A paper starts private (its owner and admins). "Publish" shares it with
--     EVERY teacher; students never see a paper.
--   * On a published paper any teacher can do anything: edit, mark final,
--     reopen, delete. Only the owner (or an admin) can make it private again.
--   * Two teachers may have it open at once: each sees who else is on it, and
--     the other's changes arrive by polling (no Realtime). Same question
--     edited by both: the last save wins.
--
-- `shared` is separate from draft/final: a final published paper stays
-- visible to everyone (to print), and reopening it keeps it published.
--
-- Additive: three columns, one table, functions and policies replaced.
-- Rollback: drop table exam_paper_presence; drop trigger exam_papers_guard;
-- drop function exam_papers_guard(); restore owns_exam_paper, the
-- t_exam_papers policy and exam_paper_set_final from 0152; drop the columns.

alter table exam_papers add column if not exists shared       boolean not null default false;
alter table exam_papers add column if not exists published_at timestamptz;
-- Who made the latest change, so an open builder knows whether to reload.
alter table exam_papers add column if not exists updated_by   uuid references profiles(id) on delete set null;

-- Owner, admin, or any teacher once the paper is published.
create or replace function public.owns_exam_paper(p_paper uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from exam_papers p
     where p.id = p_paper
       and (p.owner_id = public.acting_id() or public.is_admin() or (p.shared and public.is_teacher()))
  );
$$;
revoke all on function public.owns_exam_paper(uuid) from public;
grant execute on function public.owns_exam_paper(uuid) to authenticated;

drop policy if exists t_exam_papers on exam_papers;
drop policy if exists t_exam_papers_read on exam_papers;
drop policy if exists t_exam_papers_insert on exam_papers;
drop policy if exists t_exam_papers_update on exam_papers;
drop policy if exists t_exam_papers_delete on exam_papers;
create policy t_exam_papers_read on exam_papers for select
  using (is_teacher() and (owner_id = public.acting_id() or public.is_admin() or shared));
create policy t_exam_papers_insert on exam_papers for insert
  with check (is_teacher() and (owner_id = public.acting_id() or public.is_admin()));
-- The new row must still be one the caller may touch: a non-owner who sets
-- shared = false fails here, so only the owner/admin can make it private.
create policy t_exam_papers_update on exam_papers for update
  using (is_teacher() and (owner_id = public.acting_id() or public.is_admin() or shared))
  with check (is_teacher() and (owner_id = public.acting_id() or public.is_admin() or shared));
create policy t_exam_papers_delete on exam_papers for delete
  using (is_teacher() and (owner_id = public.acting_id() or public.is_admin() or shared));

-- Nobody but an admin moves a paper to another owner.
create or replace function public.exam_papers_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is distinct from old.owner_id and not public.is_admin() then
    raise exception 'Only an admin can change who owns a paper.';
  end if;
  return new;
end $$;
drop trigger if exists exam_papers_guard on exam_papers;
create trigger exam_papers_guard before update on exam_papers
  for each row execute function public.exam_papers_guard();

-- Same as 0152, plus who made the change.
create or replace function public.exam_paper_set_final(p_paper uuid, p_final boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_label text;
begin
  if not public.owns_exam_paper(p_paper) then
    raise exception 'Not your paper.';
  end if;
  select trim(code) || ' ' || trim(season) into v_label from exam_papers where id = p_paper;
  if v_label is null or trim(v_label) = '' then
    raise exception 'The paper needs a code and a season first.';
  end if;

  if p_final then
    update exam_papers set status = 'final', finalised_at = now(), updated_at = now(),
           updated_by = public.acting_id() where id = p_paper;
    update exam_bank_questions q
       set used_in = array_append(q.used_in, v_label)
     where q.id in (select i.bank_question_id from exam_paper_items i
                     where i.paper_id = p_paper and i.bank_question_id is not null)
       and not (v_label = any (q.used_in));
  else
    update exam_papers set status = 'draft', finalised_at = null, updated_at = now(),
           updated_by = public.acting_id() where id = p_paper;
    -- Only lift the stamp where no OTHER final paper with the same label still uses the question.
    update exam_bank_questions q
       set used_in = array_remove(q.used_in, v_label)
     where q.id in (select i.bank_question_id from exam_paper_items i
                     where i.paper_id = p_paper and i.bank_question_id is not null)
       and not exists (
             select 1 from exam_paper_items i2
               join exam_papers p2 on p2.id = i2.paper_id
              where i2.bank_question_id = q.id and p2.id <> p_paper and p2.status = 'final'
                and trim(p2.code) || ' ' || trim(p2.season) = v_label);
  end if;
  return v_label;
end $$;
revoke all on function public.exam_paper_set_final(uuid, boolean) from public;
grant execute on function public.exam_paper_set_final(uuid, boolean) to authenticated;

-- ── who has a paper open ───────────────────────────────────────────────────
-- One row per teacher per paper, its seen_at bumped every ~10 s while the
-- builder is open. "Here" means seen in the last 30 s; old rows are harmless.
create table if not exists exam_paper_presence (
  paper_id   uuid not null references exam_papers(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  seen_at    timestamptz not null default now(),
  primary key (paper_id, profile_id)
);
alter table exam_paper_presence enable row level security;

drop policy if exists t_exam_presence_read on exam_paper_presence;
create policy t_exam_presence_read on exam_paper_presence for select
  using (public.owns_exam_paper(paper_id));
drop policy if exists t_exam_presence_insert on exam_paper_presence;
create policy t_exam_presence_insert on exam_paper_presence for insert
  with check (profile_id = public.acting_id() and public.owns_exam_paper(paper_id));
drop policy if exists t_exam_presence_update on exam_paper_presence;
create policy t_exam_presence_update on exam_paper_presence for update
  using (profile_id = public.acting_id())
  with check (profile_id = public.acting_id() and public.owns_exam_paper(paper_id));
drop policy if exists t_exam_presence_delete on exam_paper_presence;
create policy t_exam_presence_delete on exam_paper_presence for delete
  using (profile_id = public.acting_id());
