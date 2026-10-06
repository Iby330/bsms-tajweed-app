-- Open the sisters' Term 1 week 1 now.
--
-- 0052 left it on Wednesday 7 October 19:00 as a backstop, to be brought
-- forward by hand once the sisters were placed. They are (26, logins sent),
-- and the programme lead released it on Tuesday 6 October. Week 1 stays due
-- Wednesday 14 October 19:00, as 0052 set it. Hareer has nothing in Term 1
-- yet (Qāʿidah), so this changes nothing for them.
--
-- Only moves the date earlier, so a re-run later changes nothing.

update section_weeks sw
set unlock_at = now()
from weeks w
where w.id = sw.week_id and sw.section = 'sisters'
  and w.term_id = 1 and w.number = 1
  and sw.unlock_at > now()
returning sw.unlock_at;
