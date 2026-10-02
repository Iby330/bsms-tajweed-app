-- Open 2026/27 Term 1 week 1 now.
--
-- 0042 left week 1's unlock_at on Monday 5 October as a backstop, to be
-- brought forward by hand once its videos and homework were ready. They are
-- (two lessons with video, HW1 and HW201 loaded by 0049), and students placed
-- on 2 October found nothing to watch. HW1 and HW201 stay due Monday
-- 5 October at 17:00 UK time, as 0042 set them.
--
-- Only moves the date earlier, so a re-run after Monday changes nothing.

update weeks
set unlock_at = timestamp '2026-10-03 00:00' at time zone 'Europe/London'
where term_id = 1 and number = 1
  and unlock_at > timestamp '2026-10-03 00:00' at time zone 'Europe/London'
returning id, unlock_at;
