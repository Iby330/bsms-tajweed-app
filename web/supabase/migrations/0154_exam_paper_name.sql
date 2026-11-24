-- A paper's own name, for the teacher only: "Advanced", "Intermediate",
-- "Lower". Several papers for the same exam share a printed title ("End Of
-- Term 1 Exam"); the name tells them apart in the list and in download file
-- names. It is never printed on the paper or the mark scheme, so it does not
-- touch the "used in" stamp and may be changed on a final paper.
--
-- Empty means unnamed: the list shows the title, as before. Additive and
-- idempotent.

alter table exam_papers add column if not exists name text not null default '';
