-- Qāʿidah homework 12 (312, the Al-Humazah rule hunt) is released for Masjid
-- Al-Aqsa: Moadh approved the review page (Ibrahim, 17 Nov). 0147 loaded it
-- held, with its opening and its deadline (Thursday 19 November, 14:00 UK)
-- already on the class's own schedule; this lifts the hold.
--
-- Idempotent.

update class_item_dates set held = false, set_at = now()
 where class_id = (select id from classes where name = 'Masjid Al-Aqsa')
   and course_id = (select id from courses where key = 'qaidah')
   and ordinal = 12
returning ordinal, opens_at, due_at, held;
