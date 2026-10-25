-- Seerah in every class's Resources (owner, 2026-10-25): the eight Seerah
-- Reflections videos, unlisted on the BSMS TAJWEED channel, as a course no
-- class takes in its plan, so nothing opens it a week at a time; Resources
-- plays all of it at once. A lesson needs a week, so they sit in Term 1 week
-- 1, out of every plan's reach (no class_courses row). Titles are the
-- videos' own, in the house "Course N: …" form.
insert into courses (key, label, position)
select 'seerah', 'Seerah', coalesce(max(position), 0) + 1 from courses
on conflict (key) do nothing;

insert into lessons (week_id, series, title, youtube_id, position, course_id, ordinal)
select w.id, 'seerah_reflections', 'Seerah ' || v.ordinal || ': ' || v.title, v.youtube_id, 4, c.id, v.ordinal
  from (values
    (1, 'fPLRl5OUrYQ', 'Why should we reflect on the life of the Prophet ﷺ?'),
    (2, 'Gvxi7EWclUE', 'The noble lineage of the Messenger ﷺ and its role in prophethood'),
    (3, '-iLzyuBKEK8', 'The spiritual and moral state of mankind prior to the coming of the Messenger ﷺ'),
    (4, 'qze17qAVu_A', 'Why the Messenger ﷺ was sent amongst the Arabs'),
    (5, '6IcEQoP9y0g', 'Knowledge of the Messenger ﷺ in the previous scriptures'),
    (6, 'h54G2gQoKk0', 'How the upbringing of the Messenger ﷺ prepared him for prophethood'),
    (7, 'bmS79_VgjuE', 'The influential reputation of the Messenger ﷺ prior to revelation'),
    (8, 'n-jiGjGWml4', 'What made Khadijah (ra) so special?')
  ) as v(ordinal, youtube_id, title),
  weeks w, courses c
 where w.term_id = 1 and w.number = 1 and c.key = 'seerah'
   and not exists (select 1 from lessons l where l.course_id = c.id and l.ordinal = v.ordinal)
returning ordinal, title, youtube_id;

insert into class_resources (class_id, course_id, position)
select cl.id, co.id,
       coalesce((select max(r.position) from class_resources r where r.class_id = cl.id), 0) + 1
  from classes cl, courses co
 where co.key = 'seerah'
on conflict (class_id, course_id) do nothing;
