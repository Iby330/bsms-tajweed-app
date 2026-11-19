-- Al-Humazah rule hunt (Qāʿidah homework 312): every hams letter now counts.
-- Moadh (via Ibrahim, 19 Nov) said the hunt missed hams letters such as the ح
-- of يَحْسَبُ and the ف of فِى. Under his 6 Nov rule only ت was required and
-- the other hams letters were accepted: right if tagged, but worth nothing.
-- All 19 of those become things to find (hams-11 to hams-29, appended so the
-- ten live ones keep their numbers), and the paper goes from 27 marks to 46.
-- The surah has 29 hams letters and the key now asks for every one.
--
-- These are exactly the options execution/homework_sql.ts now generates from
-- docs/homework-2026-27/final/qaidah-hw12.json, checked option by option:
-- only these 19 change (each was already correct; it gains its `inst`). Done
-- in place, as 0150 was, since a reload would delete the class's hand-ins.
-- Marks already given are re-scored separately by the app's hunt scorer.
--
-- Idempotent.

with found(label, inst) as (values
  ('H:104:1:2:2:hams', 'hams-11'),  -- كُ
  ('H:104:1:3:1:hams', 'hams-12'),  -- هُ
  ('H:104:2:4:5:hams', 'hams-13'),  -- هُۥ
  ('H:104:3:1:2:hams', 'hams-14'),  -- حْ
  ('H:104:3:1:3:hams', 'hams-15'),  -- سَ
  ('H:104:3:3:4:hams', 'hams-16'),  -- هُۥٓ
  ('H:104:3:4:2:hams', 'hams-17'),  -- خْ
  ('H:104:3:4:5:hams', 'hams-18'),  -- هُۥ
  ('H:104:4:1:1:hams', 'hams-19'),  -- كَ
  ('H:104:4:3:1:hams', 'hams-20'),  -- فِ
  ('H:104:4:4:3:hams', 'hams-21'),  -- حُ
  ('H:104:5:2:5:hams', 'hams-22'),  -- كَ
  ('H:104:5:4:3:hams', 'hams-23'),  -- حُ
  ('H:104:6:2:4:hams', 'hams-24'),  -- هِ
  ('H:104:7:4:4:hams', 'hams-25'),  -- فْ
  ('H:104:8:1:3:hams', 'hams-26'),  -- هَ
  ('H:104:8:2:4:hams', 'hams-27'),  -- هِ
  ('H:104:8:3:3:hams', 'hams-28'),  -- صَ
  ('H:104:9:1:1:hams', 'hams-29')  -- فِ
)
update questions q
   set points = 46,
       options = (
         select jsonb_agg(
                  case when f.inst is not null
                       then o || jsonb_build_object('correct', true, 'inst', f.inst)
                       else o end
                  order by (o->>'position')::int)
           from jsonb_array_elements(q.options) o
           left join found f on f.label = o->>'label')
 where q.homework_id = (select id from homeworks where number = 312)
   and q.qtype = 'checkbox';

update homeworks set total_marks = 46 where number = 312;

select h.total_marks, q.points,
       (select count(*) from jsonb_array_elements(q.options) o where o->>'inst' like 'hams-%') as hams_options
  from homeworks h join questions q on q.homework_id = h.id
 where h.number = 312 and q.qtype = 'checkbox';
