# Murāja'ah: timed revision for the Esteemed Ustadhs class

Status: approved by the owner through clickable prototypes (2026-11-07 to
2026-11-10). Listener screen = prototype **design C "Thumb rail"** on phone and
desktop. Teacher page = prototype **design A "Roster table"** (chosen by Claude
as the default while the owner hasn't picked; easy to change later).

Prototype references (published HTML, open in a browser; data inlined):
- Listener C: `/private/tmp/claude-502/-Users-ibrahimramadan-BSMS-Tajweed-app/00162dce-0838-41d9-85eb-8562d3621707/scratchpad/c-src/variant-c.html`
- Teacher A: `/private/tmp/claude-502/-Users-ibrahimramadan-BSMS-Tajweed-app/00162dce-0838-41d9-85eb-8562d3621707/scratchpad/c-src/mohamed-a.html`
- Both also live in the artifact https://claude.ai/artifact/EVRUVgA3JiegCJaVqKuyDU
  (files `variant-c.html`, `mohamed-a.html`).

## Who and why

The Esteemed Ustadhs class (section `ustadhs`, see
`docs/superpowers/specs/2026-11-04-esteemed-ustadhs-design.md`) is six Qur'an
teachers revising to each other, taught by Ustadh Mohamed K El-Bayouk. In a
voice note, Mohamed asked for:
- picking a portion: hizb, juz or surah;
- a mistake counter;
- a timer with pause;
- checkpoints;
- a history of attempts 1, 2, 3 with a chart of times and mistakes;
- targets he sets for time and mistakes, and clicking a student to see their
  revision history.

**Constraint:** the brothers' and sisters' programme pages must not change. Everything
here is reached only by `section = 'ustadhs'` students and that class's teacher.
Build new components; reuse existing ones read-only (import, don't modify) unless
a change is purely additive and keeps every existing test passing.

## Rules (fixed)

### Portions
- **Kinds:** a session covers one KIND of portion: several hizb, OR several juz,
  OR several surahs.
- **Data:** hizb 1–60, juz 1–30, surah 1–114. The data is in the prototype's
  inlined `<script id="portions-data">` JSON
  (`{surahs:[{n,en,ar,ayahs,pages:[a,b]}], juzs:[{n,start,page,label,hizbs:[a,b],secondHizb:{start,page,label}}], hizbs:[{n,juz,start,page,label,quarters:[{q,start,page,label}]}]}`).
  Extract it once into `web/src/lib/murajaah/portions.json`.
- **Verse keys** are "surah:ayah". A unit runs from its `start` up to (not
  including) the next unit's start. Hizb 60 and juz 30 run to 114:6.
- **Labels:** units are sorted ascending. Consecutive runs use an en dash
  ("Juz 28–30"), separate runs use " + " ("Juz 28 + 30"). Two surahs read
  "Al-Mulk + Al-Qalam"; a run longer than two reads "Al-Mulk–Al-Mursalat (11 surahs)".

### Size and bands
- **Size** (hizb-equivalents, `hizbEq`):
  - hizb = 1, juz = 2, surah = page count ÷ 10;
  - a selection SUMS its units;
  - a quarter = 0.25.
- **Time bands** per hizbEq, using the class target (defaults ideal 10, good 15,
  acceptable 20 minutes):

  | Band | Time | Colour |
  |---|---|---|
  | ideal | ≤ ideal × hizbEq | solid `--ok` fill, light text |
  | good | ≤ good × hizbEq | `--ok` tint, `--ok` text |
  | acceptable | ≤ acceptable × hizbEq | `--warn` |
  | slow | beyond acceptable | `--danger` |

  Format h:mm:ss once a time passes 59:59.
- **Mistake limit:**
  - defaults are hizb 3, juz 5, surah 3 per 10 pages (ceil, min 1);
  - a selection sums its units' limits;
  - a per-student override replaces the class value for that kind.

**Wording (owner, 2026-11-10):** the top band is called **"Ideal"**, never
"gold", in the UI, the code and the DB. Pills say "Ideal", and targets read
"Ideal ≤ 20:00". The four band labels are Ideal, Good, Acceptable and Too slow.

### Checkpoints
**Automatic checkpoints:**

| Selection | Checkpoints |
|---|---|
| one hizb | its 4 quarters ("Q2 · Al-Balad"), each banded at 0.25 |
| one juz | 1: end of its first hizb ("End of Hizb 59", ticked on reaching `secondHizb`) |
| several hizb | end of each hizb except the last |
| several juz | end of every hizb except the last (3 juz → 5) |
| one surah | none |
| several surahs | end of each surah except the last |

- **Gaps:** a gap between runs gets a label like "End of Juz 28, then Juz 30".
- **Sublabels** say where the next part starts ("next: Al-Mujadila 1 (p542)").
- **The last unit** ends at Finish.
- **"Add checkpoint"** adds a listener-chosen split at the current time. It has
  no band, because it has no set size.
- **Order:** checkpoints are ticked in order; only the latest tick can be
  unticked.
- **Bands:** each checkpoint stretch is banded on its own size.

### The clock
- **Live time:** elapsed = `elapsed_ms + (now − running_since)` while running.
  Pause folds the running span into `elapsed_ms` and clears `running_since`.
- **Server-backed:** every Start, Pause, Resume and Finish is a server write, so
  a reload or a second device shows the true time.
- **Positions:** a mistake and a checkpoint store `at_ms` on this elapsed clock.

### Mistakes
- **Two ways to add one:**
  - **Mistake +1:** a counter, with no location;
  - **tap a word:** in the on-screen mushaf, a tap marks a mistake on that word,
    and tapping the end marker marks the whole ayah. There is NO popup: it
    tints at once, and tapping it again removes it.
- **Undo** removes the most recent mark of either kind.
- **Total** = counter marks + word marks.
- **Types after Finish:** each mark can optionally be given a type
  (`hifz`, `tajweed`, `makhraj`, `fluency`: the existing
  `lib/hifz/mistake-taxonomy` CATEGORY ids). Untyped is allowed.
  makhraj is not allowed on a whole-ayah mark.

### Mid-session changes
Changing the reciter or the portion, once the timer has run or anything is
marked or ticked, asks inside the picker: "Start over with X? This clears the
time, mistakes and checkpoints." [Start over] [Keep current]. Start over discards
the draft and makes a new one.

## Data model: migration `0137_murajaah.sql` (new tables only)

These are new tables, so nothing existing changes. `revision_sessions` and
`revision_mistakes` stay as they are for the programme. RLS uses
`public.acting_id()` everywhere, never `auth.uid()`, because of seats. Pair
rights come from `public.can_listen_freely(listener, reciter)` (0135).

```
murajaah_sessions
  id uuid pk default gen_random_uuid()
  class_id uuid not null references classes(id)
  listener_id uuid not null references profiles(id)
  reciter_id  uuid not null references profiles(id)   check (listener_id <> reciter_id)
  portion_kind text not null check (portion_kind in ('hizb','juz','surah'))
  portion_ns int[] not null              -- sorted ascending, non-empty
  portion_label text not null
  hizb_eq numeric(6,2) not null
  mistake_limit int not null             -- snapshot of the target at start
  band_minutes jsonb not null            -- snapshot {ideal,good,acceptable}
  created_at timestamptz not null default now()
  timer_started_at timestamptz           -- first Start
  running_since timestamptz              -- null = not running
  elapsed_ms int not null default 0
  finished_at timestamptz                -- Finish pressed (types may follow)
  submitted_at timestamptz               -- saved; null = draft
  note text
  -- one open draft per listener at a time:
  unique index on (listener_id) where submitted_at is null

murajaah_marks
  id uuid pk, session_id uuid not null references murajaah_sessions(id) on delete cascade
  at_ms int not null
  surah_number int, ayah_number int, word_position int   -- all null = a +1 counter mark
  category text check (category is null or category in ('hifz','tajweed','makhraj','fluency'))
  created_at timestamptz not null default now()
  check ((surah_number is null) = (ayah_number is null))
  check (not (category = 'makhraj' and word_position is null and surah_number is not null))

murajaah_checkpoints
  id uuid pk, session_id uuid not null references murajaah_sessions(id) on delete cascade
  kind text not null check (kind in ('auto','added'))
  ord int not null                       -- auto: index in the automatic list; added: 1000+n
  label text not null
  at_ms int not null
  created_at timestamptz not null default now()

murajaah_targets                         -- one row per class; absent = defaults
  class_id uuid pk references classes(id)
  ideal_min numeric(5,2) not null default 10, good_min ... 15, acceptable_min ... 20
  limit_hizb int not null default 3, limit_juz int not null default 5, limit_surah10 int not null default 3
  updated_by uuid references profiles(id), updated_at timestamptz not null default now()

murajaah_target_overrides                -- per student; null column = use class value
  student_id uuid pk references profiles(id)
  class_id uuid not null references classes(id)
  limit_hizb int, limit_juz int, limit_surah10 int
  note text, updated_by uuid, updated_at timestamptz not null default now()
```

### RLS
**Sessions:**
- **Listener:** reads their own sessions (`listener_id = acting_id()`). They can
  insert with `can_listen_freely(listener_id, reciter_id)`, and the class_id
  must be the listener's class. They can update and delete their own drafts
  (`submitted_at is null`).
- **Reciter:** reads sessions where `reciter_id = acting_id() and submitted_at is not null`.
- **Teacher:** reads sessions whose `class_id` is a class they teach. Use the
  existing helper that already scopes the teacher's classes; check
  `lib/teacher/scope.ts` and the 0133 migration for how the ustadhs class
  finds its teacher. Do NOT use bare `is_teacher()`: other teachers must not
  see this class.

**Marks and checkpoints:**
- **Read:** follows its session.
- **Insert and delete:** only by the session's listener while the session is
  a draft.
- **Update:** allowed only to set `category`, while
  `submitted_at is null` (types are chosen after Finish and before Save).

**Targets and overrides:**
- **Read:** the class's students and its teacher.
- **Write:** the class's teacher only.

**Applying it:**
- Apply with `execution/apply_migration.ts`. Read `LEARNINGS.md` first:
  multi-statement probes with raise-to-rollback, and the acting_id rule.
- After applying, regenerate or hand-extend `web/src/lib/database.types.ts`
  for the new tables, following however the repo did it for 0133–0136.
- Rollback = drop the five tables (nothing else depends on them).

## Shared library: `web/src/lib/murajaah/` (pure, unit-tested)

- `portions.ts`: types, `unitOf(kind,n)`, `selectionLabel(kind, ns)`,
  `hizbEqOf(kind, ns)`, `rangesOf(kind, ns)` (verse-key ranges, used to dim
  words outside the selection), `firstPageOf(kind, ns)`.
- `checkpoints.ts`: `autoCheckpoints(kind, ns)` gives
  `[{ord,label,sub,short,tag,scale}]`, per the table above. `short` is
  "Q1" / "H55" / "S67", and `tag` is the phone place name ("Al-A'la",
  "to Al-Jumu'ah", surah name).
- `bands.ts`: `bandOf(ms, hizbEq, minutes)` gives
  `'ideal'|'good'|'acceptable'|'slow'`; `bandLimits(hizbEq, minutes)`;
  `formatClock(ms)`.
- `targets.ts`: defaults, `mistakeLimitFor(kind, ns, classTarget, override?)`.
- `clock.ts`: `elapsedAt(session, now)`.
- `actions.ts` (server actions, `"use server"`; each checks `currentProfile()`
  and `section === 'ustadhs'`):
  - `startDraft(reciterId, kind, ns)` gives the id. It snapshots the target
    and replaces any existing draft of this listener.
  - `discardDraft(id)`;
  - `startClock(id)`, `pauseClock(id)`, `resumeClock(id)`,
    `finishClock(id)`. Each sets the server-side time fields, using the DB
    `now()` (call an RPC or compute in SQL so the clock is server-authoritative).
  - `addMark(id, atMs, loc|null)` gives the id; `removeMark(markId)`;
  - `tickCheckpoint(id, kind, ord, label, atMs)` gives the id;
    `untickCheckpoint(cpId)`;
  - `setMarkTypes(id, [{markId, category|null}])`;
  - `submitSession(id, note)`;
  - `deleteSession(id)` (only for a draft).
- `queries.ts` (server):
  - `myDraft()`;
  - `sessionsAsReciter(studentId)` and `sessionsAsListener(studentId)` (with
    marks count and checkpoints);
  - `classSessions(classId)` for the teacher;
  - `classTarget(classId)`, `overrides(classId)`;
  - `classmates`: reuse the existing `classmatesOf` from `lib/hifz/review-queries`.
- `web/src/components/murajaah/attempt-chart.tsx`: a shared presentational
  inline-SVG chart, used by both sides.
  - **Input:** attempts `[{date, ms, mistakes}]`, `hizbEq`, `minutes`, `limit`.
  - **Time series:** band shading behind it, dashed mistake-limit line,
    the latest point emphasised.
  - **Axes:** attempt numbers 1, 2, 3… along the x axis, real axis labels,
    and tabular figures.
  - **Colours:** from tokens only.

## Listener screen (student side), design C

**Where:**
- **Route:** the ustadhs student's Hifdh page Review tab. Today
  `components/app/listen-tab.tsx` (`ListenTab`) renders it, from
  `app/(student)/hifdh/page.tsx`, when `section === 'ustadhs'`.
- **Swap:** replace what ListenTab renders with the new screen. Put the new
  screen in `web/src/components/murajaah/listener/*`. Keep ListenTab's export
  name or update its single caller.
- **Programme students** keep `ReviewLogger` untouched.

**Layout** (match the prototype's look at app scale; the app's own tokens and
components, `web/docs/brand-system.md`):
- **Title line:** `Listening to [Name ▾] · [Portion ▾]`, both inline buttons.
  - **Name:** single-choice, listing the classmates from `classmatesOf`.
  - **Portion:** a popover on desktop and a bottom sheet on phones, with tabs
    Hizb / Juz / Surah:
    - grids with the start label, and a surah search (English, Arabic or
      number) with a list;
    - **multi-select:** a click toggles a unit, and selected units are filled
      with a tick;
    - picking in another tab starts a new selection of that kind, and a small
      line says so;
    - a pinned summary line shows the label and its ideal time, with a Clear
      link;
    - **NO Apply button:** closing (✕, outside click, Esc) saves; an empty
      selection keeps the previous one; the mid-session start-over confirm
      shows inside the picker.
- **Mushaf:**
  - the app's `MushafReader`/`MushafPager` (the ustadhs read the full mushaf,
    see `lib/hifz/mushaf-reach.ts`);
  - opens at the selection's first page;
  - words outside the selection are dimmed and can't be tapped;
  - two pages side by side on wide desktops if the existing components allow
    it cheaply, otherwise one;
  - a "My own mushaf" link hides the on-screen mushaf, leaving a large
    timer/band/count panel for listeners following in a printed mushaf.
- **Desktop rail** (right side, sticky under the top chrome):
  - **timer card:** the digits, a band pill with its label, and the band bar
    with 10:00 / 15:00 / 20:00 ticks scaled to the selection;
  - **controls:** Start / Pause / Resume and Finish (Finish asks for a second
    tap);
  - **checkpoint list:** the next one highlighted, done ones showing split time
    with a band pill and the mistakes in that split, then "+ Add checkpoint";
  - **target line:** "Target: under N mistakes · set by Ustadh Mohamed";
  - **mistake controls:** Undo, and Mistake +1 (the one emphasised button) with
    its count;
  - **Left-handed** toggle (mirrors the rail and the phone bar; remembered in
    localStorage);
  - **keyboard:** Space or M = +1, Z = undo, P = start/pause, N = tick next,
    C = add checkpoint, arrows = pages.
- **Phone:**
  - the mushaf scrolls under a bar fixed above the app's bottom tab bar
    (measure it the way the app already does: see the recent commit "the
    content clears the tab bar by measurement");
  - **row 1:** time + band, Start/Pause, Finish;
  - **row 2:** checkpoint chips showing short + tag + split pill, then "+ Add";
  - **row 3:** Undo + a wide Mistake +1 with its count;
  - every control has a tap area of at least 44px.
- **Finish → summary:**
  - total time and band, mistakes vs limit (met/missed), and checkpoint splits
    with bands;
  - a list of marks, each with optional type chips;
  - a note;
  - **Save** (calls setMarkTypes, then submitSession) and **Discard** (inline
    confirm).
- **After Save:**
  - a short result line, and the screen resets for the next person;
  - **"My revision"** history sits below it: my own sessions as reciter,
    newest first, with the date, portion, listener, time + band and mistakes
    vs limit, expandable to splits and types;
  - an AttemptChart per portion label, chosen with a select.

## Teacher page (Mohamed), design A "Roster table"

**Where:** the teacher Hifdh page, `app/teacher/hifdh/page.tsx`, when the
teacher's class is the ustadhs class. That page already special-cases ustadhs
(see `git log --grep=ustadhs`). New components go in
`web/src/components/murajaah/teacher/*`.

**What:**
- **Roster table, one row per student:**
  - the latest attempt: portion, time + band, mistakes vs limit;
  - attempts in the last 7 days;
  - a trend (faster/slower over their last attempts at the same portion);
  - a status.
- **"Needs attention" strip:** no attempt in 7+ days, missed mistake limit
  twice running, or slow band twice running.
- **Clicking a student** opens their page or panel:
  - an AttemptChart with a portion select;
  - the full history, newest first, with expandable splits and types;
  - prev/next through the roster.
- **Targets side panel:**
  - **class time bands:** ideal, good and acceptable minutes per hizb;
  - **class mistake limits:** hizb, juz and per-10-surah-pages;
  - **per-student overrides:** each with a note;
  - the table updates as you edit (a live preview), then Save writes
    `murajaah_targets` / `murajaah_target_overrides`.
- **Empty state:** before any session exists, the empty state explains that
  sessions appear once classmates start logging.

## Testing and finish

- **Tests:** unit tests for every pure function in `lib/murajaah`, and
  component tests in the style of the existing `components/app/*.test.tsx`.
- **The machine is 8 GB and memory-tight:**
  - run vitest only on the files you touched, with `--maxWorkers=1`;
  - `npx tsc --noEmit -p .` once near the end;
  - no `next build` and no dev server in subagents (the main session does the
    build and the localhost preview).
- **Data:** there is NO local database: anything run against Supabase hits
  production. Tests must mock Supabase like the existing tests do.
- **Git:** commit in small steps, each staging only your own files (never
  `git add -A` / `.` / `-a`). End messages with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do NOT push.
