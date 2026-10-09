-- Resources: a course's videos a class can watch outside its plan.
--
-- A class reaches lessons through its plan (class_courses), which also gives
-- them a week, a homework and a place in a term. Some classes should only be
-- able to go back to another course's videos: Masjid An-Nabawi does not take
-- Umm al-Kitab, but their teacher wants them to refer to its videos
-- (programme lead, 9 October). `class_resources` names those (class, course)
-- pairs; the Resources page lists them, and plays the course's lessons with
-- no week, homework or progress attached. The row is the permission: the page
-- reads it as the student (RLS: their own class only) before it reads the
-- lessons past RLS.

create table if not exists class_resources (
  class_id  uuid not null references classes(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  position  integer not null default 1,
  primary key (class_id, course_id)
);
comment on table class_resources is
  'A course whose videos this class can watch from Resources, outside its plan: no week, homework or progress.';

alter table class_resources enable row level security;
revoke all on class_resources from anon;
drop policy if exists s_class_resources_read on class_resources;
create policy s_class_resources_read on class_resources for select using (
  class_id = (select class_id from profiles where id = auth.uid())
);
drop policy if exists t_class_resources on class_resources;
create policy t_class_resources on class_resources
  for all using (is_teacher()) with check (is_teacher());

insert into class_resources (class_id, course_id, position)
select c.id, co.id, 1 from classes c, courses co
 where c.name = 'Masjid An-Nabawi' and co.key = 'ummul_kitab'
on conflict do nothing;
