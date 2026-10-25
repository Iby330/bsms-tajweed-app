-- Sahabah Stories 2, the second session of the weekly halaqah, into Term 1's
-- Sahabah Stories course (0095) as item 2, so it opens for each class in
-- week 2 of Term 1. Filed in Term 1 week 2 beside Tajweed 2 and Umm al-Kitab
-- 2, after them, the way 0102 filed session 1.
-- Title from the video's own YouTube title, in the house "Course N: …" form.
insert into lessons (week_id, series, title, youtube_id, position, course_id, ordinal)
select w.id, 'seerah',
       'Sahabah Stories 2: Abu Bakr: Unmatched faith, resilience, and legacy',
       'Vh-uY2YWols', 3, c.id, 2
  from weeks w, courses c
 where w.term_id = 1 and w.number = 2 and c.key = 'sahabah_t1'
   and not exists (select 1 from lessons l where l.course_id = c.id and l.ordinal = 2)
returning id, title, youtube_id;
