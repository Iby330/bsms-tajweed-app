-- An item of a course a class takes can be met in another term.
--
-- Until now an item could only live in its course's term: class_course_items
-- names a week, and the term was always the one class_courses gives the
-- course. A teacher could not put a Term 2 course's video in Term 1 week 8,
-- and the schedule screen refused with "That course is on Term 2's schedule".
-- class_course_items.term_id names the item's own term; null is the course's,
-- so every row already there means what it meant.
--
-- class_item_week is 0108's body with the first arm reading that term. Every
-- other schedule function (class_item_unlock_at, class_item_due_at, the
-- calendar ones) goes through it, so they follow without a change. Added
-- items (class_added_items) already carried a term per row.
--
-- With every term_id null this returns exactly what it did before. The app's
-- copy is classItemTerm in lib/curriculum/tree.ts; execution/schedule_parity.ts
-- compares the two.
--
-- Every statement idempotent; one transaction.

begin;

alter table public.class_course_items
  add column if not exists term_id integer references public.terms(id);

comment on table public.class_course_items is
  'Per-class week for a course item, where it differs from item k = week k. '
  'week_number is weeks.number within term_id, or within the term the class '
  'takes the course in when term_id is null.';

create or replace function public.class_item_week(p_class uuid, p_course uuid, p_ordinal integer)
returns table(term_id integer, week_number integer)
language sql stable security definer set search_path = public as $$
  select coalesce(i.term_id, cc.term_id),
         coalesce(i.week_number, greatest(p_ordinal, 1))
  from class_courses cc
  left join class_course_items i
    on i.class_id = cc.class_id and i.course_id = cc.course_id
   and i.ordinal = greatest(p_ordinal, 1)
  where cc.class_id = p_class and cc.course_id = p_course
  union all
  select a.term_id, a.week_number
  from class_added_items a
  where a.class_id = p_class and a.course_id = p_course
    and a.ordinal = greatest(coalesce(p_ordinal, 1), 1)
    and not exists (select 1 from class_courses cc where cc.class_id = p_class and cc.course_id = p_course)
$$;

commit;
