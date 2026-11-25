-- The Exam Builder has no admins (owner's call, 2026-11-25): every teacher
-- has the same access. A private paper is its owner's alone; a shared one is
-- every teacher's. Any teacher can correct, approve, bin and restore bank
-- questions (0156 already opened UPDATE). Deleting a bank row outright is not
-- something the app does, and is left as it was.
create or replace function public.owns_exam_paper(p_paper uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from exam_papers p
     where p.id = p_paper
       and (p.owner_id = public.acting_id() or (p.shared and public.is_teacher()))
  );
$$;

drop policy if exists t_exam_papers_read on exam_papers;
drop policy if exists t_exam_papers_insert on exam_papers;
drop policy if exists t_exam_papers_update on exam_papers;
drop policy if exists t_exam_papers_delete on exam_papers;
create policy t_exam_papers_read on exam_papers for select
  using (is_teacher() and (owner_id = public.acting_id() or shared));
create policy t_exam_papers_insert on exam_papers for insert
  with check (is_teacher() and owner_id = public.acting_id());
-- A non-owner who sets shared = false fails the check, so only the owner can make it private.
create policy t_exam_papers_update on exam_papers for update
  using (is_teacher() and (owner_id = public.acting_id() or shared))
  with check (is_teacher() and (owner_id = public.acting_id() or shared));
create policy t_exam_papers_delete on exam_papers for delete
  using (is_teacher() and (owner_id = public.acting_id() or shared));

-- Nobody moves a paper to another owner.
create or replace function public.exam_papers_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'A paper cannot be moved to another owner.';
  end if;
  return new;
end $$;
