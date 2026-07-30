-- ═══════════════════════════════════════════════════════════════════════
-- BSMS Tajweed — core schema, grading views, RLS
-- The grading views encode the VERIFIED 2025/26 formulas (brainstorm A2/A3):
--   Termly Avg = mean of homework %s, zeros/unsubmitted EXCLUDED
--   Term %     = 0.8 × Exam% + 0.2 × Termly Avg      (matched 41/42 records)
--   EOY %      = mean of the three Term %             (matched 14/14 students)
-- DO NOT ALTER the view math without re-verifying against the 2025/26 data.
-- ═══════════════════════════════════════════════════════════════════════

-- ============ ENUMS ============
create type user_role as enum ('student','teacher');
create type section_t as enum ('brothers','sisters');
create type series_t as enum ('tajweed','umm_al_kitab','tfp','seerah');
create type qtype_t as enum ('mcq','checkbox','text','paragraph','grid');
create type scoring_t as enum ('exact','per_option','manual');
create type sub_status as enum ('draft','submitted','auto_marked','approved');
create type strike_reason as enum ('absence','homework','conduct');
create type session_t as enum ('monday','thursday');

-- ============ PEOPLE ============
create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  section section_t not null,
  teacher_id uuid
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'student',
  section section_t not null,
  class_id uuid references classes(id),
  is_active boolean not null default true,
  created_at timestamptz default now()
);

alter table classes add constraint classes_teacher_fk
  foreign key (teacher_id) references profiles(id);

-- ============ CALENDAR (placeholder dates until faculty calendar drops) ============
create table terms (
  id int primary key check (id in (1,2,3)),
  starts_on date not null,
  ends_on date not null,
  exam_max int not null                      -- 89 / 93 / 98 (A3)
);

create table weeks (
  id uuid primary key default gen_random_uuid(),
  term_id int not null references terms(id),
  number int not null,
  unlock_at timestamptz not null,
  unique (term_id, number)
);

-- ============ CONTENT ============
create table lessons (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id),
  series series_t not null,
  title text not null,
  youtube_id text,                           -- null until channel re-uploads
  position int not null default 1
);

create table homeworks (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id),
  number int not null unique,                -- HW 1..21; TFP 101..107
  title text not null,
  series series_t not null default 'tajweed',
  total_marks numeric not null,              -- OFFICIAL total (bonus excluded — HW15)
  due_at timestamptz,
  is_graded boolean not null default true
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references homeworks(id),
  position int not null,
  qtype qtype_t not null,
  scoring scoring_t not null default 'exact',
  prompt text not null,                      -- may contain inline Arabic → <MixedText>
  points numeric not null default 0,
  is_bonus boolean not null default false,
  is_task boolean not null default false,    -- practical task → voice note, 0 marks
  options jsonb,                             -- [{position,label,value,correct}]
  rubric jsonb,                              -- [{id,desc,marks}] — null ⇒ needs rubric
  needs_key boolean not null default false   -- grid Qs: teacher marks manually
);

-- ============ STUDENT WORK ============
create table lesson_watches (
  student_id uuid references profiles(id),
  lesson_id uuid references lessons(id),
  watched_at timestamptz default now(),
  primary key (student_id, lesson_id)
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references homeworks(id),
  student_id uuid not null references profiles(id),
  status sub_status not null default 'draft',
  is_late boolean not null default false,
  submitted_at timestamptz,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  unique (homework_id, student_id)
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  question_id uuid not null references questions(id),
  response jsonb not null,                   -- {"selected":[0,2]} | {"text":"…"} | {"grid":{…}}
  auto_marks numeric,
  auto_rubric jsonb,                         -- [{id,present,why}] — teacher sees reasoning
  final_marks numeric,
  unique (submission_id, question_id)
);

create table voice_notes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  question_id uuid not null references questions(id),
  storage_path text not null,
  duration_s int
);

-- ============ EXAMS (80% of the grade — entry via roster UI) ============
create table exam_scores (
  student_id uuid references profiles(id),
  term_id int references terms(id),
  score numeric not null,
  entered_by uuid references profiles(id),
  entered_at timestamptz default now(),
  primary key (student_id, term_id)
);

-- ============ HIFZ (An-Nas 114 → Al-Jinn 72; position-in-range model) ============
create table surahs (
  number int primary key,
  order_index int not null unique,           -- 1 = An-Nas … 43 = Al-Jinn
  name_ar text not null,
  name_en text not null
);

create table hifz_profiles (
  student_id uuid primary key references profiles(id),
  start_surah int not null default 114 references surahs(number),
  target_count int not null
);

create table hifz_records (
  student_id uuid references profiles(id),
  surah_number int references surahs(number),
  passed_at date not null default current_date,
  teacher_comment text,                      -- visible to BOTH teacher and student
  marked_by uuid references profiles(id),
  primary key (student_id, surah_number)
);

-- ============ STRIKES & ATTENDANCE (manual only) ============
create table strikes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id),
  term_id int not null references terms(id),
  reason strike_reason not null,
  note text,
  issued_by uuid not null references profiles(id),
  issued_at timestamptz default now()
);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id),
  student_id uuid not null references profiles(id),
  session_date date not null,
  session_type session_t not null,
  present boolean not null,
  absence_reason text,
  strike_id uuid references strikes(id),
  recorded_by uuid references profiles(id),
  unique (student_id, session_date, session_type)
);

-- ============ INDEXES ============
create index idx_profiles_class on profiles(class_id);
create index idx_lessons_week on lessons(week_id);
create index idx_questions_hw on questions(homework_id);
create index idx_submissions_student on submissions(student_id);
create index idx_answers_submission on answers(submission_id);
create index idx_hifz_records_student on hifz_records(student_id);
create index idx_strikes_student_term on strikes(student_id, term_id);
create index idx_attendance_class_date on attendance(class_id, session_date);

-- ═══════════ GRADING VIEWS — verified formulas. security_invoker so RLS
-- of the underlying tables applies (students see only their own rows). ═══════════
create view v_hw_pct with (security_invoker = true) as
  select s.student_id, h.id as homework_id, h.number, w.term_id,
         sum(a.final_marks) filter (where not q.is_bonus) / h.total_marks * 100 as pct
  from submissions s
  join homeworks h on h.id = s.homework_id and h.is_graded
  join weeks w on w.id = h.week_id
  join answers a on a.submission_id = s.id
  join questions q on q.id = a.question_id
  where s.status = 'approved'
  group by s.student_id, h.id, h.number, w.term_id, h.total_marks;

create view v_termly_avg with (security_invoker = true) as
  select student_id, term_id, avg(pct) as hw_avg
  from v_hw_pct where pct > 0
  group by student_id, term_id;

create view v_term_pct with (security_invoker = true) as
  select t.student_id, t.term_id,
         0.8 * (e.score / tm.exam_max * 100) + 0.2 * t.hw_avg as term_pct
  from v_termly_avg t
  join exam_scores e on e.student_id = t.student_id and e.term_id = t.term_id
  join terms tm on tm.id = t.term_id;

create view v_eoy with (security_invoker = true) as
  select student_id, avg(term_pct) as eoy_pct
  from v_term_pct
  group by student_id
  having count(*) = 3;

create view v_hifz_progress with (security_invoker = true) as
  select hp.student_id, hp.start_surah, hp.target_count,
         count(hr.surah_number) as passed,
         count(hr.surah_number)::numeric / hp.target_count * 100 as pct
  from hifz_profiles hp
  left join hifz_records hr on hr.student_id = hp.student_id
  group by hp.student_id, hp.start_surah, hp.target_count;

-- ═══════════ RLS ═══════════
create or replace function is_teacher() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'teacher') $$;

alter table classes        enable row level security;
alter table profiles       enable row level security;
alter table terms          enable row level security;
alter table weeks          enable row level security;
alter table lessons        enable row level security;
alter table homeworks      enable row level security;
alter table questions      enable row level security;
alter table lesson_watches enable row level security;
alter table submissions    enable row level security;
alter table answers        enable row level security;
alter table voice_notes    enable row level security;
alter table exam_scores    enable row level security;
alter table surahs         enable row level security;
alter table hifz_profiles  enable row level security;
alter table hifz_records   enable row level security;
alter table strikes        enable row level security;
alter table attendance     enable row level security;

-- teachers: flat admin over everything
create policy t_classes        on classes        for all using (is_teacher()) with check (is_teacher());
create policy t_profiles       on profiles       for all using (is_teacher()) with check (is_teacher());
create policy t_terms          on terms          for all using (is_teacher()) with check (is_teacher());
create policy t_weeks          on weeks          for all using (is_teacher()) with check (is_teacher());
create policy t_lessons        on lessons        for all using (is_teacher()) with check (is_teacher());
create policy t_homeworks      on homeworks      for all using (is_teacher()) with check (is_teacher());
create policy t_questions      on questions      for all using (is_teacher()) with check (is_teacher());
create policy t_lesson_watches on lesson_watches for all using (is_teacher()) with check (is_teacher());
create policy t_submissions    on submissions    for all using (is_teacher()) with check (is_teacher());
create policy t_answers        on answers        for all using (is_teacher()) with check (is_teacher());
create policy t_voice_notes    on voice_notes    for all using (is_teacher()) with check (is_teacher());
create policy t_exam_scores    on exam_scores    for all using (is_teacher()) with check (is_teacher());
create policy t_surahs         on surahs         for all using (is_teacher()) with check (is_teacher());
create policy t_hifz_profiles  on hifz_profiles  for all using (is_teacher()) with check (is_teacher());
create policy t_hifz_records   on hifz_records   for all using (is_teacher()) with check (is_teacher());
create policy t_strikes        on strikes        for all using (is_teacher()) with check (is_teacher());
create policy t_attendance     on attendance     for all using (is_teacher()) with check (is_teacher());

-- students: own rows; reference data readable; content gated by week unlock
create policy s_profiles_own   on profiles   for select using (id = auth.uid());
create policy s_classes_read   on classes    for select using (auth.uid() is not null);
create policy s_terms_read     on terms      for select using (auth.uid() is not null);
create policy s_weeks_read     on weeks      for select using (auth.uid() is not null);
create policy s_surahs_read    on surahs     for select using (auth.uid() is not null);

create policy s_lessons_unlocked on lessons for select using (
  exists (select 1 from weeks w where w.id = week_id and w.unlock_at <= now())
);
create policy s_homeworks_unlocked on homeworks for select using (
  exists (select 1 from weeks w where w.id = week_id and w.unlock_at <= now())
);
-- questions: NO student select policy. Students read questions ONLY through
-- get_homework_for_student(), which strips options[].correct and rubric.

create policy s_watch_read  on lesson_watches for select using (student_id = auth.uid());
create policy s_watch_write on lesson_watches for insert with check (student_id = auth.uid());

create policy s_sub_read   on submissions for select using (student_id = auth.uid());
create policy s_sub_insert on submissions for insert with check (
  student_id = auth.uid() and status in ('draft','submitted')
);
create policy s_sub_update on submissions for update
  using (student_id = auth.uid() and status in ('draft','submitted'))
  with check (student_id = auth.uid() and status in ('draft','submitted'));

create policy s_ans_read on answers for select using (
  exists (select 1 from submissions s where s.id = submission_id and s.student_id = auth.uid())
);
create policy s_ans_insert on answers for insert with check (
  exists (select 1 from submissions s where s.id = submission_id
          and s.student_id = auth.uid() and s.status = 'draft')
);
create policy s_ans_update on answers for update
  using (exists (select 1 from submissions s where s.id = submission_id
                 and s.student_id = auth.uid() and s.status = 'draft'))
  with check (exists (select 1 from submissions s where s.id = submission_id
                      and s.student_id = auth.uid() and s.status = 'draft'));

create policy s_vn_read on voice_notes for select using (
  exists (select 1 from submissions s where s.id = submission_id and s.student_id = auth.uid())
);
create policy s_vn_insert on voice_notes for insert with check (
  exists (select 1 from submissions s where s.id = submission_id and s.student_id = auth.uid())
);

create policy s_exam_read   on exam_scores   for select using (student_id = auth.uid());
create policy s_hifzp_read  on hifz_profiles for select using (student_id = auth.uid());
create policy s_hifzr_read  on hifz_records  for select using (student_id = auth.uid());
create policy s_strikes_read on strikes      for select using (student_id = auth.uid());
create policy s_att_read    on attendance    for select using (student_id = auth.uid());

-- ═══════════ RPC: sanitized homework fetch for students ═══════════
-- Returns questions with options[].correct and rubric STRIPPED so answer
-- keys never reach the client. Teachers query the table directly instead.
create or replace function get_homework_for_student(hw_id uuid)
returns jsonb
language sql stable security definer set search_path = public as
$$
  select case
    when not exists (
      select 1 from homeworks h join weeks w on w.id = h.week_id
      where h.id = hw_id and w.unlock_at <= now()
    ) then null
    else (
      select jsonb_build_object(
        'homework', jsonb_build_object(
          'id', h.id, 'number', h.number, 'title', h.title,
          'series', h.series, 'total_marks', h.total_marks,
          'due_at', h.due_at, 'is_graded', h.is_graded
        ),
        'questions', coalesce(jsonb_agg(
          jsonb_build_object(
            'id', q.id, 'position', q.position, 'qtype', q.qtype,
            'prompt', q.prompt, 'points', q.points,
            'is_bonus', q.is_bonus, 'is_task', q.is_task,
            'options', (
              select jsonb_agg(jsonb_build_object(
                'position', o->'position', 'label', o->'label', 'value', o->'value'
              ) order by (o->>'position')::int)
              from jsonb_array_elements(q.options) o
            )
          ) order by q.position
        ) filter (where q.id is not null), '[]'::jsonb)
      )
      from homeworks h
      left join questions q on q.homework_id = h.id
      where h.id = hw_id
      group by h.id
    )
  end
$$;

-- ═══════════ LEADERBOARDS — security definer by design: aggregated,
-- name+pct+rank only, filtered to the caller's section (Q10/Q11) ═══════════
create view v_lb_individual as
  select p.full_name, c.name as class_name, round(avg(hp.pct), 2) as pct,
         rank() over (order by avg(hp.pct) desc) as rank
  from v_hw_pct hp
  join profiles p on p.id = hp.student_id and p.is_active
  join classes c on c.id = p.class_id
  where p.section = (select section from profiles where id = auth.uid())
  group by p.id, p.full_name, c.name;

create view v_lb_class as
  select c.name as class_name, c.section, round(avg(hp.pct), 2) as pct,
         rank() over (order by avg(hp.pct) desc) as rank
  from v_hw_pct hp
  join profiles p on p.id = hp.student_id and p.is_active
  join classes c on c.id = p.class_id
  where c.section = (select section from profiles where id = auth.uid())
  group by c.id, c.name, c.section;

create view v_lb_hifz_class as
  select c.name as class_name, c.section,
         round(avg(hpr.pct), 2) as pct,
         rank() over (order by avg(hpr.pct) desc) as rank
  from v_hifz_progress hpr
  join profiles p on p.id = hpr.student_id and p.is_active
  join classes c on c.id = p.class_id
  where c.section = (select section from profiles where id = auth.uid())
  group by c.id, c.name, c.section;

-- note: leaderboard views intentionally read v_hw_pct/v_hifz_progress as
-- their OWNER (postgres) — but those are security_invoker views, so the
-- leaderboard views re-query underlying tables as owner. That is the
-- deliberate definer-style aggregation described in the plan.

grant select on v_hw_pct, v_termly_avg, v_term_pct, v_eoy, v_hifz_progress,
               v_lb_individual, v_lb_class, v_lb_hifz_class to authenticated;

-- ═══════════ STORAGE: voice notes bucket ═══════════
insert into storage.buckets (id, name, public) values ('voice-notes','voice-notes', false)
on conflict (id) do nothing;

create policy vn_student_insert on storage.objects for insert with check (
  bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy vn_student_read on storage.objects for select using (
  bucket_id = 'voice-notes' and (
    (storage.foldername(name))[1] = auth.uid()::text or is_teacher()
  )
);
