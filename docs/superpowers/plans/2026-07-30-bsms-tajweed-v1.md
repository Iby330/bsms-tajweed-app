# BSMS Tajweed App — v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Lane subagents MUST load `superpowers:writing-plans` + `superpowers:test-driven-development` and expand their lane spec into a micro-task TDD plan before writing code. UI lanes MUST also load `dataviz` (before any stat tile/progress/chart) and `ui-ux-pro-max` or `taste-skill` (before building screens).

**Goal:** Ship the v1 demo of the BSMS Tajweed platform — login, weekly video lessons, in-app auto-marked homework with teacher approval, full hifz tracker, strikes, attendance, leaderboards — polished on desktop and mobile, ready to convince the teacher group, before October.

**Architecture:** Next.js (App Router) frontend + Supabase (Postgres/Auth/Storage, project `ssqeakiutclbiwizrchh`, eu-west-2) + Groq `llama-3.3-70b-versatile` for free-text marking (verified 9/9 on real student answers). Single-tenant, hardcoded to BSMS. All grading math in SQL views replicating the verified 2025/26 formulas. Demo runs on fictional seed students.

**Tech Stack:** Next.js 15 + TypeScript + Tailwind v4 + shadcn/ui · Supabase JS v2 · Groq API (OpenAI-compatible) · next/font self-hosted (Archivo, Inter, IBM Plex Sans Arabic, Amiri Quran) · Netlify (@netlify/plugin-nextjs)

**Source of truth:** `brainstorms/2026-07-27-bsms-tajweed-app.md` (16 Q&A + 5 artifact analyses). This plan implements it; on conflict, the brainstorm wins.

---

## Context

BSMS (Brighton Sussex Muslim Students) runs a Tajweed + hifz programme: 43 students, 7 gender-segregated classes, 7 teachers, 3 terms, 21 homeworks, 3 in-person exams. Today it runs on YouTube + Google Forms + Google Sheets; teachers hand-type scores. v1's job is a **stakeholder demo that convinces the teacher group** — full navigation surface, real core loop, "Coming soon" stubs for the rest — buildable in ~7–10 focused days, live before October.

Everything discovery-wise is done: all 21 homeworks exported with full answer keys (`reference/forms_export.json`, 20/21 reconciled against the gradebook), grading formula reverse-engineered and verified (41/42 records), brand colours sampled from the logo, marking model live-tested. Infrastructure exists: GitHub repo `Iby330/bsms-tajweed-app` (private), Supabase project `bsms-tajweed` (London), Groq key working, keys in `.env`.

**Standing rules (from brainstorm):** build for today, no speculative abstraction · single-tenant · retention features parked · deposit tracking excluded entirely · polish everything evenly, no hero screen · distinct desktop AND mobile layouts · ~£0 running cost.

---

## Scope

| IN v1 | OUT (stub as "Coming soon" or omit) |
|---|---|
| Email+password auth via invite link; roles: student / teacher (teachers = flat admin) | Public signup; Google SSO |
| 7 classes + roster; weekly-unlocking lessons (YouTube embeds, 1–2 videos/week); watch tracking | Video upload/hosting |
| In-app homework forms (all 21 imported); objective auto-mark in code; free-text auto-mark via Groq; teacher **accept-or-edit** approval; per-question right/wrong feedback | Marking for TFP (no mark scheme yet) |
| Voice-note task recording (MediaRecorder → Supabase Storage) + teacher playback | — |
| Full hifz tracker: per-class target, per-student start/override, surah-by-surah pass + teacher comments, colour-coded register, pace marker | Hifz-check *flow* (record start manually in v1) |
| Strikes (manual, display-only) · Attendance register with absence reason + optional strike | Auto-strikes; deposit tracking (excluded **entirely**) |
| 3 leaderboards (class HW · individual HW · hifz per class), gender-separated, compact widget | Public full-table rankings |
| Exam score entry (in roster page — exams are 80% of grade) · Progress: HW avg, Term %, EOY % via verified formulas | In-app exam sitting |
| Demo seed data (fictional students) · Dark mode toggle · "Coming soon" stubs: Resources, Seerah, Notifications, Manage curriculum | Email reminders (v1.1, needs Resend) · multi-year history · retention features |

---

## Repo & project layout

Workspace root becomes the git repo (`Iby330/bsms-tajweed-app`), Next.js app in `web/`:

```
/  (repo root = workspace root)
├─ web/                      # Next.js app (Netlify base dir = web)
│  ├─ src/app/               # App Router routes
│  ├─ src/components/        # ui/ (shadcn), app/ (domain components)
│  ├─ src/lib/               # supabase clients, grading, marking, utils
│  ├─ supabase/migrations/   # SQL migrations (supabase CLI)
│  ├─ supabase/seed.sql      # reference + demo seed
│  └─ public/brand/logo.png  # copied from image.png
├─ execution/                # operational scripts (importer, eval, forms export)
├─ directives/               # SOPs (unchanged)
├─ reference/forms_export.json  # form definitions — no student data, COMMIT
└─ brainstorms/              # NOT committed (contains real student names)
```

**Privacy rule for git:** append to `.gitignore` before first commit — real-student data never leaves the machine:

```gitignore
brainstorms/
Tajweed Master Spreadsheet 2025_26/
Tawjeed HW Master Guide .md
.tooling/
image.png.bak
```
(`reference/forms_export.json` is form *definitions* only — verified free of student data — and the importer needs it: commit. `Tawjeed HW Master Guide .md` stays local; its model answers are embedded into rubrics by the importer.)

**Demo seed uses FICTIONAL student names only.** Real class names (Masjid An-Nabawi, Al-Aqsa, Al-Haram, Zukhruf, Hareer, Rayyan, Salsabeel) and real teacher first names are fine.

---

## Design system — "Editorial calm" (user-approved)

Direction: a well-made print journal, not a SaaS dashboard. Built from the sampled logo palette. No gradients, no saturated accents, one ink family doing the talking, film grain at whisper level.

### Tokens (`web/src/app/globals.css`)

```css
:root {
  /* brand — sampled from logo (A5/Q15 in brainstorm) */
  --ink:        #1D2339;  /* primary text, sidebar, buttons  (8.14:1 on slate) */
  --ink-2:      #303D5B;  /* secondary text, labels          (5.66:1 on slate) */
  --slate:      #B0BDCC;  /* brand ground — borders, muted fills */
  --page:       #EDF0F4;  /* page background (slate tint) */
  --card:       #FBFCFD;  /* card surface */
  --line:       #D6DDE5;  /* hairline borders */
  /* semantic — muted, print-adjacent; validate with dataviz palette validator */
  --ok:         #2E5E4E;  /* hifz above target / approved / pass */
  --warn:       #8A6A2F;  /* on target / pending review */
  --danger:     #8C3B2E;  /* below target / strike / overdue */
  --focus:      #3B5BDB;  /* focus rings only */
  --radius: 10px;
}
.dark {
  --ink: #E8ECF2;  --ink-2: #AEBBCB;  --page: #151A28;
  --card: #1D2339; --line: #2A3350;  --slate: #4A5670;
}
/* film grain — logo texture at whisper level, one overlay on <body> */
body::after {
  content: ""; position: fixed; inset: 0; pointer-events: none;
  background-image: url("/brand/noise.png"); opacity: 0.035; mix-blend-mode: multiply;
}
```

### Typography (all self-hosted via `next/font` — CSP-clean, no external requests)

| Role | Font | Notes |
|---|---|---|
| Display / headers | **Archivo** (600–800, tight tracking `-0.02em`) | Matches the logo's tight grotesque lockup |
| UI / body | **Inter** (400–600) | |
| Arabic UI + student answers | **IBM Plex Sans Arabic** | Arabic rendered ~112% of Latin size to match x-height |
| Qur'anic verses in questions | **Amiri Quran** | 1.4em, `dir="rtl"`, generous line-height 2 |

**RTL rule:** every Arabic segment (question titles carry inline verses — A5: zero images, all inline text) renders inside `<span dir="rtl" className="font-quran">` with `unicode-bidi: isolate`. Build one `<MixedText>` component that splits on Arabic Unicode ranges (`/[؀-ۿ...]+/`) and use it for ALL question/option/answer rendering. This is the single most important rendering component in the app.

### Layout — two deliberate layouts (Q14: "slightly different versions", not just reflow)

- **Desktop (≥1024px):** fixed ink (`--ink`) sidebar 240px — logo, nav, theme toggle, user — content on `--page`, max-w 1120px, 12-col grid.
- **Mobile:** top app bar (logo + theme) + **bottom tab bar**, 5 tabs. Student: Home · Lessons · Homework · Hifz · Me. Teacher: Home · Review · Roster · Hifz · More. Content single column, cards full-bleed with 16px gutters.

### Component vocabulary (build once in `src/components/app/`, reuse everywhere)

- `StatTile` — big Archivo number, small ink-2 label, optional delta. (Load `dataviz` before building.)
- `PaceMarker` — hifz progress: horizontal track of surah ticks 114→72, filled to current, a labelled notch at "should-be" (from calendar), colour by `--ok/--warn/--danger`.
- `LeaderboardWidget` — exactly 3 rows: person above, **you** (ink bg, white text), person below + rank badge. Per Q11, never a full table on dashboards.
- `StrikeDots` — 3 slots: filled `--danger` dot = strike, hollow = remaining. Tooltip shows reason + date.
- `CountdownChip` — homework deadline: "2d 4h" → turns `--warn` <24h, `--danger` <6h.
- `ComingSoon` — full-page stub: muted illustration-free card, Archivo title, one-line description, "Coming soon" badge. Used by Resources / Seerah / Notifications / Manage curriculum.
- `VideoCard` — YouTube thumb, series tag (Tajweed / Umm al-Kitāb / TFP), duration, watched tick.
- `MarkBadge` — per-question ✓/✗ + marks "2/3", colour ok/danger.

Motion: 150–200ms ease-out transitions only; no springs, no confetti. Focus states always visible. Everything keyboard-navigable.

---

## Data model — migration `web/supabase/migrations/0001_core.sql`

Complete schema (RLS after tables). Grading math lives in views so every surface reads identical numbers.

```sql
-- ============ ENUMS ============
create type user_role as enum ('student','teacher');
create type section_t as enum ('brothers','sisters');
create type series_t as enum ('tajweed','umm_al_kitab','tfp','seerah');
create type qtype_t as enum ('mcq','checkbox','text','paragraph','grid');
create type scoring_t as enum ('exact','per_option','manual');       -- manual = grid/needs_key
create type sub_status as enum ('draft','submitted','auto_marked','approved');
create type strike_reason as enum ('absence','homework','conduct');
create type session_t as enum ('monday','thursday');

-- ============ PEOPLE ============
create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                -- 'Masjid An-Nabawi', 'Zukhruf', ...
  section section_t not null,
  teacher_id uuid                            -- set after profiles exist
);
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'student',
  section section_t not null,
  class_id uuid references classes(id),
  is_active boolean not null default true,   -- 3 strikes → false; record kept (Q14)
  created_at timestamptz default now()
);
alter table classes add constraint classes_teacher_fk
  foreign key (teacher_id) references profiles(id);

-- ============ CALENDAR (placeholder dates until faculty calendar drops — Q15) ============
create table terms (
  id int primary key check (id in (1,2,3)),
  starts_on date not null, ends_on date not null,
  exam_max int not null                      -- 89 / 93 / 98 (A3)
);
create table weeks (
  id uuid primary key default gen_random_uuid(),
  term_id int not null references terms(id),
  number int not null,                       -- week within term
  unlock_at timestamptz not null,            -- weekly video unlock (Q8)
  unique (term_id, number)
);

-- ============ CONTENT ============
create table lessons (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id),
  series series_t not null,
  title text not null,
  youtube_id text,                           -- null until channel re-uploads (Q4)
  position int not null default 1
);
create table homeworks (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id),
  number int not null unique,                -- HW 1..21; TFP use 101..107
  title text not null,
  series series_t not null default 'tajweed',
  total_marks numeric not null,              -- OFFICIAL total (excludes bonus — HW15 rule, A5)
  due_at timestamptz,
  is_graded boolean not null default true    -- TFP false until mark scheme added
);
create table questions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references homeworks(id),
  position int not null,
  qtype qtype_t not null,
  scoring scoring_t not null default 'exact',
  prompt text not null,                      -- may contain inline Arabic — render via <MixedText>
  points numeric not null default 0,
  is_bonus boolean not null default false,   -- HW15 bonus round: marked but excluded from total
  is_task boolean not null default false,    -- practical task → voice note, 0 marks
  options jsonb,                             -- [{position,label,value,correct}] — null for text
  rubric jsonb,                              -- [{id,desc,marks}] for LLM marking — null if needs_rubric
  needs_key boolean not null default false   -- 4 grid Qs: teacher marks manually
);

-- ============ STUDENT WORK ============
create table lesson_watches (
  student_id uuid references profiles(id), lesson_id uuid references lessons(id),
  watched_at timestamptz default now(), primary key (student_id, lesson_id)
);
create table submissions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references homeworks(id),
  student_id uuid not null references profiles(id),
  status sub_status not null default 'draft',
  is_late boolean not null default false,    -- past due_at; accepted (mid-year catch-up, Q14)
  submitted_at timestamptz,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  unique (homework_id, student_id)
);
create table answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  question_id uuid not null references questions(id),
  response jsonb not null,                   -- {"selected":[0,2]} | {"text":"مد طبيعي"} | {"grid":{...}}
  auto_marks numeric,                        -- null until marked; code (objective) or LLM (free-text)
  auto_rubric jsonb,                         -- LLM: [{id,present,why}] — teacher sees reasoning
  final_marks numeric,                       -- teacher accept (copies auto) or edit (Q14)
  unique (submission_id, question_id)
);
create table voice_notes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  question_id uuid not null references questions(id),
  storage_path text not null,                -- bucket voice-notes/{student_id}/{submission_id}.webm
  duration_s int
);

-- ============ EXAMS (80% of grade — A2; entry lives in roster UI, Q11) ============
create table exam_scores (
  student_id uuid references profiles(id), term_id int references terms(id),
  score numeric not null, entered_by uuid references profiles(id),
  entered_at timestamptz default now(), primary key (student_id, term_id)
);

-- ============ HIFZ (An-Nas 114 → Al-Jinn 72; position-in-range model — Q9/Q11a) ============
create table surahs (
  number int primary key,                    -- 114 down to 72 seeded; order_index 1..43
  order_index int not null unique, name_ar text not null, name_en text not null
);
create table hifz_profiles (
  student_id uuid primary key references profiles(id),
  start_surah int not null default 114 references surahs(number),  -- hifz-check sets ≠114
  target_count int not null                  -- class default, teacher-overridable per student
);
create table hifz_records (
  student_id uuid references profiles(id), surah_number int references surahs(number),
  passed_at date not null default current_date,
  teacher_comment text,                      -- visible to BOTH (Q9)
  marked_by uuid references profiles(id), primary key (student_id, surah_number)
);

-- ============ STRIKES & ATTENDANCE (manual only — Q7/Q8/Q11) ============
create table strikes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id),
  term_id int not null references terms(id),
  reason strike_reason not null, note text,
  issued_by uuid not null references profiles(id), issued_at timestamptz default now()
);
create table attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id),
  student_id uuid not null references profiles(id),
  session_date date not null, session_type session_t not null,
  present boolean not null, absence_reason text,
  strike_id uuid references strikes(id),     -- optional strike issued from register (Q11)
  recorded_by uuid references profiles(id),
  unique (student_id, session_date, session_type)
);

-- ============ GRADING VIEWS — the verified 2025/26 formulas (A2/A3). DO NOT ALTER. ============
create view v_hw_pct as                       -- % per approved submission; bonus Qs excluded
  select s.student_id, h.id homework_id, h.number, w.term_id,
         sum(a.final_marks) filter (where not q.is_bonus) / h.total_marks * 100 as pct
  from submissions s
  join homeworks h on h.id = s.homework_id and h.is_graded
  join weeks w on w.id = h.week_id
  join answers a on a.submission_id = s.id
  join questions q on q.id = a.question_id
  where s.status = 'approved'
  group by s.student_id, h.id, h.number, w.term_id, h.total_marks;

create view v_termly_avg as                   -- RULE: unsubmitted/zero EXCLUDED, not zero (A3)
  select student_id, term_id, avg(pct) as hw_avg
  from v_hw_pct where pct > 0 group by student_id, term_id;

create view v_term_pct as                     -- Term % = 0.8×Exam% + 0.2×HWavg (verified 41/42)
  select t.student_id, t.term_id,
         0.8 * (e.score / tm.exam_max * 100) + 0.2 * t.hw_avg as term_pct
  from v_termly_avg t
  join exam_scores e on e.student_id = t.student_id and e.term_id = t.term_id
  join terms tm on tm.id = t.term_id;

create view v_eoy as                          -- EOY = mean of 3 Term % (verified 14/14)
  select student_id, avg(term_pct) as eoy_pct from v_term_pct
  group by student_id having count(*) = 3;

create view v_hifz_progress as
  select hp.student_id, hp.start_surah, hp.target_count,
         count(hr.surah_number) as passed,
         count(hr.surah_number)::numeric / hp.target_count * 100 as pct
  from hifz_profiles hp left join hifz_records hr on hr.student_id = hp.student_id
  group by hp.student_id, hp.start_surah, hp.target_count;
```

**RLS (same migration):** enable on every table. Policies:
- `is_teacher()` helper (`security definer` fn checking `profiles.role = 'teacher'`): teachers full read/write on everything (flat admin — Q10).
- Students: read own `profiles/submissions/answers/hifz_*/strikes/attendance/exam_scores` rows; insert/update own `submissions` (only while `status in ('draft','submitted')`), `answers` (only while parent submission is `draft`), `lesson_watches`, `voice_notes`. Read `lessons/homeworks/questions` **only where week.unlock_at <= now()** — enforce unlock server-side, and **strip `options[].correct` + `rubric` via a security-definer RPC** (`get_homework_for_student`) so answer keys never reach the client.
- Leaderboards: 3 `security definer` views (`v_lb_class`, `v_lb_individual`, `v_lb_hifz_class`) exposing only name/class/pct/rank, **filtered to the caller's section** (brothers see brothers — Q10).
- Storage: bucket `voice-notes` — student inserts under own uid prefix; teachers read all.

---

## Import pipeline — `execution/import_forms.ts`

One idempotent script: `reference/forms_export.json` (+ local master guide for model answers) → `web/supabase/seed.sql` content section. Run with `npx tsx execution/import_forms.ts > web/supabase/seed_content.sql`.

Mapping rules (all from brainstorm A5 — implement exactly):

1. **Skip items**: `title ∈ {Name, Class, Which Class do you belong to?}` (34 items) · `SECTION_HEADER`/`PAGE_BREAK` · zero-point single-option notices.
2. **Practical tasks**: single-option items matching `/task|recite|record|find .* examples/i` with 0 pts → `is_task = true` (voice-note slot), 0 marks.
3. **Types**: `MULTIPLE_CHOICE→mcq` · `CHECKBOX→checkbox` · `TEXT→text` · `PARAGRAPH_TEXT→paragraph` · `GRID|CHECKBOX_GRID→grid, scoring='manual', needs_key=true`.
4. **Grid residual points** (Apps Script returns null): HW 9→**10**, HW 19→**3**, HW 20→**4**, HW 21→**10**.
5. **Scoring mode**: checkbox with points > 1 and >1 correct option → `per_option` (guide's "1 mark for each"); else `exact`.
6. **HW 15 bonus**: items after the "BONUS ROUND" marker → `is_bonus = true`; `total_marks = 7` (official), bonus marked but excluded (view already handles).
7. **Rubrics for free-text**: parse `Tawjeed HW Master Guide .md` blocks HW 1–12, 16–18 → `[{id, desc, marks}]` per concept (the guide's model answers are reliable; its *totals* are not — never read totals from it). HW 13/14/15/19/20/21 free-text → `rubric = null` (LLM skipped, routed to teacher manual marking until schemes added).
8. **TFP forms** → homeworks numbered 101–107, `series='tfp'`, `is_graded=false`, `points=0` (user: graded later, mark scheme pending).
9. **Totals check (hard assert)**: per homework, `sum(points where not is_bonus) == gradebook divisor` `{1:10, 2:8, 3:10, 4:10, 5:4, 6:12, 7:16, 8:13, 9:15, 10:10, 11:12, 12:9, 13:6, 14:13, 15:7, 16:9, 17:8, 18:12, 19:18, 20:18, 21:18}` — abort loudly on mismatch.

Reference seed (hand-written in `seed.sql`): 43 surahs (114→72, Arabic + English names) · 7 classes with sections + teacher names · 3 terms (placeholder dates, `exam_max` 89/93/98) · weeks with placeholder `unlock_at`.

---

## Marking pipeline — `web/src/lib/marking/`

**Flow:** student submits → `markSubmission(id)` server action → objective questions scored **in code instantly** → free-text queued per-question to Groq → status `auto_marked` → teacher review (accept copies auto→final; edit overrides) → `approved` → student sees `MarkBadge` per question + total.

**Objective scorer (`objective.ts`)** — pure function, exhaustively unit-tested:
- `mcq/exact`: full points iff selected set == correct set, else 0.
- `checkbox/per_option`: `points × (|selected ∩ correct| − |selected \ correct|) / |correct|`, floored at 0 (wrong picks cancel — matches Forms behaviour).
- `grid/manual` + rubric-less free-text: `auto_marks = null` → teacher manual queue.

**LLM marker (`llm.ts`)** — the exact tested configuration (smoke test 9/9, 0.4s avg):

```ts
// model: llama-3.3-70b-versatile · temperature: 0 · response_format: json_object
// ONE question per call. NEVER send student name/email (privacy rule, Q16).
const SYSTEM = `You mark Tajweed homework for a UK university programme. Students answer in Arabic script, Latin transliteration, English, or a mix — all equally valid. Judge MEANING only, never spelling or script. Transliteration is wildly inconsistent (tabai / tabee'i / tabiyi / طبيعي all denote the same term). A blank or off-topic answer earns nothing. Award each rubric concept independently. Return ONLY JSON: {"concepts":[{"id":"<id>","present":true|false,"why":"<8 words max>"}]}`;
// user message: JSON.stringify({ question, rubric, student_answer })
// marks = rubric.filter(c => result[c.id].present).sum(c.marks)  ← summed IN CODE, never by the model
// on 429: exponential backoff (free tier: 30 RPM); on parse failure: retry once, then null → teacher queue
```

**Eval harness — `execution/eval_marking.ts`** (run before the teacher demo; local student data never committed):
Ground truth = response-tab recorded total − deterministic objective marks (computed from answer key) = free-text marks actually awarded per student per HW. Run the LLM on those same answers → report per-question MAE and % of submissions within ±1 mark. **Gate: ≥85% within ±1 → ship; else swap model (`openai/gpt-oss-120b`, one-line change) and re-run.**

---

## Screens & routes

```
web/src/app/
├─ (auth)/login · invite/[token]           # invite → set password → land in role home
├─ (student)/
│  ├─ home            # THIS WEEK: VideoCards (1–2, Q8) · CountdownChip · StatTiles (HW avg,
│  │                  #   Term %, EOY %) · PaceMarker · StrikeDots · LeaderboardWidget
│  ├─ lessons         # past weeks by term, locked future weeks greyed with unlock date
│  ├─ homework/[n]    # form: MixedText prompts, options, textarea, MediaRecorder for is_task;
│  │                  #   after approval → per-question MarkBadge + auto_rubric "why"
│  ├─ hifz            # surah track 114→72, passed ticks, teacher comments per surah, pace notch
│  └─ me              # profile, strikes detail, theme toggle
├─ (teacher)/
│  ├─ home            # Needs-my-attention queue (auto_marked count) · attendance widget (today's
│  │                  #   session: present/absent+reason+optional strike, Q11) · class StatTiles
│  ├─ review/[submissionId]  # side-by-side: question · student answer (MixedText) · auto marks +
│  │                  #   rubric booleans + "why" · [Accept] [Edit marks] per Q · approve all
│  ├─ roster          # class table: name · LB rank (Q11) · HW% · hifz passed/target · strikes ·
│  │                  #   EXAM ENTRY column per term (80% of grade lives here)
│  ├─ hifz            # register: rows=students, colour-coded --ok/--warn/--danger vs pace (Q11);
│  │                  #   tap student → mark surah passed + comment; set class target & overrides
│  └─ classes/[id]    # read-only other classes (flat admin)
└─ coming-soon/[slug] # resources · seerah · notifications · curriculum  → ComingSoon component
```

Both role homes show ALL nav items including stubs — the demo's "full surface area" principle (Q7).

---

## Build phases

### Phase 0 — Foundation (sequential, ~1 session)

**Files:** repo root, `web/*` scaffold, `.gitignore`, `web/netlify.toml`

- [ ] Append privacy entries to `.gitignore` (block above) — **verify `git status` shows no student-data paths before first commit**
- [ ] `git init` at workspace root · `git remote add origin git@github.com:Iby330/bsms-tajweed-app.git` · initial commit (CLAUDE.md, directives/, execution/, reference/, .gitignore)
- [ ] Scaffold: `npx create-next-app@latest web --ts --tailwind --app --src-dir` · add shadcn/ui · `next/font` self-hosted Archivo/Inter/IBM Plex Sans Arabic/Amiri Quran
- [ ] Design tokens into `globals.css` (exact block above) · generate `public/brand/noise.png` (tiny tileable noise) · copy `image.png` → `public/brand/logo.png`
- [ ] Build shell: desktop ink sidebar + mobile bottom tabs + theme toggle (class strategy) + `ComingSoon` + `MixedText` (with unit tests: Arabic/Latin splitting, RTL isolation)
- [ ] `supabase link --project-ref ssqeakiutclbiwizrchh` · fetch API keys (`supabase projects api-keys`) → `web/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`) · confirm `.env.local` gitignored
- [ ] `web/netlify.toml` (base=web, @netlify/plugin-nextjs) · push · **USER ACTION: link repo in Netlify UI** · verify deploy of shell
- [ ] Commit per step

### Phase 1 — The contract (sequential, ~1–2 sessions; everything else depends on it)

**Files:** `web/supabase/migrations/0001_core.sql`, `web/supabase/seed.sql`, `execution/import_forms.ts`, `web/src/lib/database.types.ts`

- [ ] Write migration exactly as specified above (tables → views → RLS → storage bucket + policies) · `supabase db push`
- [ ] Hand-write reference seed: 43 surahs, 7 classes, 3 terms (placeholder dates + exam_max), weeks
- [ ] TDD the importer: fixture = 3 real forms from `forms_export.json` (HW 1 clean · HW 15 bonus · HW 9 grid); assert skip-rules, residuals, scoring modes, bonus flags, and the **totals hard-assert** for all 21
- [ ] Run importer → seed content → `supabase db reset` (migration + full seed) → spot-check: 21+7 homeworks, ~151 graded questions, HW15 total=7
- [ ] `supabase gen types typescript` → `database.types.ts` — **the frozen interface all lanes import**
- [ ] Grading-view fixture test: insert one synthetic student's full year via SQL, assert `v_term_pct`/`v_eoy` reproduce a known 2025/26 row (e.g. 0.8×(57/89·100)+0.2×85.76 ≈ 68.39)
- [ ] Commit; tag `contract-v1`

### Phase 2 — Parallel lanes (subagent-driven; interfaces = `database.types.ts` + tokens + components from P0/P1)

Each lane's subagent: load `superpowers:writing-plans` + `test-driven-development` (+ `dataviz`, `ui-ux-pro-max`/`taste-skill` for UI lanes) → expand lane into micro-task TDD plan → implement → per-task review. Lanes touch disjoint routes; shared code only `src/lib/` + `src/components/app/` (append-only during P2 to avoid conflicts; refactors wait for P3).

- [ ] **Lane A — Auth & shell wiring:** Supabase auth (email+password) · `invite` flow via `auth.admin.inviteUserByEmail` + roster CSV seeding script (`execution/invite_students.ts`) · middleware role-routing (student→/home, teacher→/teacher/home) · deactivated-account gate (`is_active=false` → polite locked screen, record kept) · session handling in server components
- [ ] **Lane B — Student learning loop:** lessons list with unlock gating (server-side, via RPC) · YouTube embed + watch tracking (IFrame API, ≥90% → `lesson_watches`) · homework form (all 5 qtypes, `MixedText` everywhere, autosave draft, hard-cutoff banner + `is_late` on submit) · MediaRecorder voice notes → Storage · post-approval feedback view (MarkBadge + rubric "why")
- [ ] **Lane C — Marking service + teacher review:** `objective.ts` (exhaustive table-driven tests: exact, per_option incl. wrong-pick cancellation, empty) · `llm.ts` with backoff + null-fallback · `markSubmission` server action · review UI (accept-all / per-question edit, approve → locks) · manual-marking queue for `needs_key` + rubric-less · **eval harness** run against ground truth, report committed to `docs/eval-report.md` (numbers only, no student names)
- [ ] **Lane D — Hifz, strikes, attendance:** hifz register (colour-coded vs pace from calendar; round pace UP — Q9) · mark-passed + comment flow · class target + per-student override + start_surah entry (manual hifz-check result) · student hifz page with PaceMarker + comments · strike issue flow (reason enum + note) + StrikeDots everywhere · attendance register widget (per session date/type, absent→reason→optional strike in one modal)
- [ ] **Lane E — Dashboards, leaderboards, exams, progress:** both role homes assembled from lane components · 3 leaderboard views + LeaderboardWidget (section-filtered) · roster page with exam-entry column (validates 0..exam_max) · StatTiles reading `v_termly_avg`/`v_term_pct`/`v_eoy` · coming-soon routes

### Phase 3 — Integration, seed, polish (sequential, ~2 sessions)

- [ ] Demo seed: `web/supabase/seed_demo.sql` — ~20 **fictional** students across all 7 real classes, staged realism: some weeks approved, one homework sitting in `auto_marked` (so the demo shows the approval queue live), hifz spread (below/on/above pace), a couple of strikes, partial attendance
- [ ] Cross-lane QA sweep on desktop AND mobile (distinct layouts verified per screen) · dark-mode audit every screen · RTL audit on every question containing Arabic (HW 6/7/16 have inline verses)
- [ ] Run eval harness end-to-end; if <85% within ±1, swap model and re-run (one line)
- [ ] `simplify` + `code-review` pass over the whole diff · Lighthouse mobile ≥90 on student home
- [ ] Write `docs/demo-script.md`: the 10-minute teacher-group walkthrough (login as student → watch → submit HW with Arabic answers → login as teacher → approve queue → roster → hifz register → strikes → leaderboards → stubs as roadmap)
- [ ] **USER ACTION: walk Yunus through it; ratify scope (Q6 requirement) before inviting real teachers**

---

## Verification

- **Unit gates:** `objective.ts` table tests · importer fixture tests + 21-homework totals assert · `MixedText` RTL tests · grading-view fixture reproduces a real 2025/26 row to 2dp
- **Eval gate:** `npx tsx execution/eval_marking.ts` → ≥85% of historical free-text submissions within ±1 mark (report in `docs/eval-report.md`)
- **E2E demo path (manual, from `docs/demo-script.md`):** fictional student logs in → this week shows correct videos → watches (tick appears) → submits HW 3 answering in Arabic script AND transliteration → teacher sees it in queue auto-marked → edits one mark → approves → student sees per-question feedback; teacher enters an exam score → StatTiles update per formula; hifz register colour-codes correctly after marking a surah passed
- **Deploy check:** Netlify production build green; login works on the deployed URL from a phone
- **Privacy check:** `git log --stat` shows no brainstorms/, spreadsheet, or guide files; demo DB contains zero real student names

## Out of scope (v1.1+ backlog, from brainstorm)
Email reminders (Resend) · TFP mark schemes + grading · HW 13/14/15/19/20/21 free-text rubrics (teacher manual-marks meanwhile) · hifz-check flow UI · Seerah content placement · real calendar dates (data entry when faculty dates drop) · real roster import + invites · web push · resource library · multi-year history · retention features

## Open items needing humans
1. **Yunus ratifies MVP scope** (Q6) — send him the brainstorm + this plan
2. TFP mark scheme + whether Al-Mabādi' stays level-gated (Q14 tension)
3. Faculty calendar dates → `terms`/`weeks` data entry
4. Six missing free-text rubrics (teachers)
5. Netlify repo link (user, 2 minutes, during Phase 0)
