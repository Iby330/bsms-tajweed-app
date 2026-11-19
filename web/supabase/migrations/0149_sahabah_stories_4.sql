-- Sahabah Stories 4, Ja'far ibn Abi Talib, the fourth session of the weekly
-- halaqah (recorded 12 November, on the BSMS TAJWEED channel as gVuTxhca40s),
-- into Term 1's Sahabah Stories course (0095) as item 4. The course is in
-- every class's Resources (0121) and on no class's plan (0122), so it shows
-- there beside sessions 1 to 3 at once. Filed in Term 1 week 4, after that
-- week's other lessons, the way 0120 and 0129 filed sessions 2 and 3.
-- Title from the video's own YouTube title, in the house "Course N: …" form.
insert into lessons (week_id, series, title, youtube_id, position, course_id, ordinal)
select w.id, 'seerah',
       'Sahabah Stories 4: Ja''far ibn Abi Talib: Altruist, Ambassador, Warrior, Martyr',
       'gVuTxhca40s',
       coalesce((select max(l.position) from lessons l where l.week_id = w.id), 0) + 1,
       c.id, 4
  from weeks w, courses c
 where w.term_id = 1 and w.number = 4 and c.key = 'sahabah_t1'
   and not exists (select 1 from lessons l where l.course_id = c.id and l.ordinal = 4)
returning id, title, youtube_id, position;
