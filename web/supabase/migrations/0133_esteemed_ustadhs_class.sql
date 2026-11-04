-- The Esteemed Ustadhs class: Mohamed teaching, the five brothers' teachers as
-- students on a seat each. Apply only once the code that hides this section is
-- live (0130-0132 and the sections.ts release). People are found by the class
-- they teach, so no email addresses go in the repo.

insert into classes (name, section, teacher_id)
select 'Esteemed Ustadhs', 'ustadhs', p.id from profiles p
 where p.is_admin and p.full_name = 'Mohamed K El-Bayouk'
on conflict (name) do nothing;

update profiles set section = 'ustadhs'
 where is_admin and full_name = 'Mohamed K El-Bayouk';

-- One seat per teacher: same name and picture, student in this class, no login.
insert into profiles (id, login_id, full_name, role, section, class_id, is_active, setup_complete, avatar_url)
select gen_random_uuid(), t.id, t.full_name, 'student', 'ustadhs', u.id, true, true, t.avatar_url
  from classes own
  join profiles t on t.id = own.teacher_id
  cross join (select id from classes where name = 'Esteemed Ustadhs') u
 where own.name in ('Masjid Quba', 'Masjid Al-Haram', 'Masjid Al-Aqsa', 'Masjid An-Nabawi', 'Masjid Al-Umawi')
on conflict (login_id) do nothing;

-- A reviewer can only mark a reciter who has a hifz profile. Start at An-Nas
-- with every surah the app holds, so the whole range is on the list.
insert into hifz_profiles (student_id, start_surah, target_count)
select p.id, 114, (select count(*) from surahs)
  from profiles p
 where p.login_id is not null
on conflict (student_id) do nothing;

select p.full_name, p.role, p.section, c.name as class_name, h.target_count
  from profiles p
  join classes c on c.id = p.class_id
  left join hifz_profiles h on h.student_id = p.id
 where p.section = 'ustadhs';
