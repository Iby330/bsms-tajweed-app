-- Every teacher can correct a bank question (owner's call, 2026-11-25).
-- Before this only an admin could (0152). Binning a question (archived), its
-- review status and its "used in" labels stay admin-only: the server action
-- refuses them from anyone else. Deleting a row is still admin-only.
drop policy if exists t_exam_bank_admin_update on exam_bank_questions;
drop policy if exists t_exam_bank_teacher_update on exam_bank_questions;
create policy t_exam_bank_teacher_update on exam_bank_questions for update
  using (is_teacher()) with check (is_teacher());
