# Hifz peer review & mistake tracker — design

Approved 2026-08-14. Peer revision for hifz: the teacher pairs students up; while
student B recites from memory, student A follows a mushaf-style Qur'an text on their
own device and taps the words B gets wrong, classifying each mistake as they go. On
submit, the session feeds a per-student mistake tracker — patterns like "makhraj of ض
is weak" or "ikhfa wrong 7× across 3 surahs" — and a heatmap over the text itself.
The reciter and the teacher both see the results; the teacher never edits them.

## Decisions (user-confirmed)

- **Peer review, not teacher marking.** Students log each other's mistakes during
  paired revision. The teacher's role is visibility: pairs are assigned on the
  register, results are read on the student detail page.
- **Teacher assigns pairs.** Students only ever see their assigned partner. Pairs
  persist until the teacher changes them — no per-lesson setup.
- **Text scope is the reciter's memorised range** — passed surahs plus the one in
  progress. The reviewer can move between them mid-session.
- **Two-level quick pick per mistake.** Tap a word → category (hifz / tajweed /
  makhraj / fluency) → specific (which rule; which letter, auto-suggested from the
  tapped word; which slip) → optional short note. ~3 taps live.
- **Patterns, not just words.** The tracker aggregates by rule/letter/category
  across sessions. Observations that aren't word-anchored ("weak hifz overall")
  are session-level flags captured at submit time.
- **Text source: quran.com API, seeded once.** Their v4 API is the source of truth
  (word-by-word Uthmani text with mushaf page/line data), but production never
  calls it — an execution script imports it as a seed migration. No rate limits,
  no API key on Netlify, stable word keys forever.
- **Mushaf rendering, single font.** Real Unicode Uthmani text in the KFGQPC
  Uthmanic Hafs font, laid out with the printed Madani mushaf's exact page and
  line breaks (seeded per word). Not the 604 per-page QPC glyph fonts — that
  upgrade stays possible without touching the data model.
- **Both sides get Overview | Review tabs** — `/hifz` for students,
  `/teacher/hifz/[studentId]` for teachers. Overview is today's content, unchanged.

## Data — migration `0013_hifz_peer_review.sql`

```sql
quran_words (
  surah_number int references surahs(number),
  ayah_number  int not null,
  word_position int not null,          -- 1-based within the ayah
  text_uthmani text not null,
  page_number  int not null,           -- Madani 604-page mushaf
  line_number  int not null,           -- 1..15 within the page
  primary key (surah_number, ayah_number, word_position)
)
```

Ayah-end markers (۝ + ayah numeral) are seeded as words too — they occupy line
positions in the mushaf, so layout needs them. Readable by all authenticated users;
written only by migrations.

```sql
revision_pairs (
  id uuid pk, student_a uuid, student_b uuid,     -- unordered; either reviews the other
  assigned_by uuid, assigned_at timestamptz, active boolean
)
revision_sessions (
  id uuid pk, reciter_id uuid, reviewer_id uuid,
  started_at timestamptz, submitted_at timestamptz,  -- null = draft
  overall_note text, flags text[]                    -- e.g. '{weak_hifz}'
)
revision_mistakes (
  id uuid pk, session_id uuid references revision_sessions on delete cascade,
  surah_number int, ayah_number int, word_position int,
  category text check (category in ('hifz','tajweed','makhraj','fluency')),
  detail text, note text, created_at timestamptz
)
```

One active pair per student (enforced in the assign action). RLS:

- Reviewer: full access to their own sessions and those sessions' mistakes while
  draft; read after submit.
- Reciter: read sessions about them **only when submitted** — drafts are invisible.
- Teacher: read everything for students in scope (existing `is_teacher()` /
  scope pattern). No teacher writes.

The pattern tracker and heatmap aggregate in TypeScript from raw rows (per-student
row counts are small); no new SQL views.

## Seeding — `execution/seed_quran_words.py`

Operational tooling, 3-layer style. Calls the quran.com v4 API chapter by chapter
(`words=true`, word fields: `text_uthmani`, `page_number`, `line_number`,
char type to keep ayah-end markers), and **emits
`web/supabase/migrations/0014_quran_words_seed.sql`** (~77k inserts, the
`0002_reference_seed.sql` pattern) so the DB stays reproducible from migrations.
Also downloads the KFGQPC Uthmanic Hafs woff2 into `web/public/fonts/` (one-off;
`@font-face` in globals).

## Pure logic (TDD, no DB, no React)

- `lib/quran/mushaf.ts` — `groupIntoPages(words)` → pages → lines → words, keyed
  by the seeded `page_number`/`line_number`; the reader renders exactly this.
- `lib/hifz/mistake-taxonomy.ts` — the curated pick lists: tajweed rules (ikhfa,
  idgham, iqlab, izhar, qalqalah, madd, ghunnah, tafkhim/tarqiq), hifz slips
  (forgot / swapped / added), fluency (hesitation / repetition); and
  `lettersOf(word)` — base letters of a word, diacritics stripped, for makhraj
  suggestions.
- `lib/hifz/mistakes.ts` — `aggregatePatterns(mistakes, sessions)` → per
  `(category, detail)`: all-time count, last-28-day count, distinct surahs, last
  seen; session flags aggregate alongside ("weak hifz in 3 of last 5 sessions").
  `wordHeat(mistakes, now)` → per-word intensity, last-28-day mistakes weighted
  double.

## Server actions — `lib/hifz/review-actions.ts`

- Teacher: `assignPair(studentA, studentB)` (roster-scoped, deactivates any
  existing active pair containing either student), `unassignPair(pairId)`.
- Reviewer: `startSession(reciterId)` — validates an active pair links the caller
  and reciter; returns the existing draft if one is open. `logMistake(sessionId,
  location, category, detail?, note?)`, `removeMistake(mistakeId)`,
  `submitSession(sessionId, flags, overallNote)` — all guarded to the session's
  reviewer; log/remove refuse after submit.

## UI

- **Student `/hifz`** — tabs via `?tab=` search param, server-rendered.
  *Overview*: existing hero / journey / record. *Review*: partner card; no pair →
  "Your teacher hasn't paired you yet."
  - *Review your partner*: surah picker over the partner's memorised range →
    mushaf reader in logging mode. Tap word → bottom sheet (`mistake-sheet.tsx`):
    four category buttons → detail chips → optional note. Marked words tint; tap
    again to edit or remove. Session bar shows partner + running count; Finish →
    wrap-up sheet (flags + overall note) → Submit.
  - *My feedback*: submitted sessions about me (date, reviewer, surahs, count),
    pattern tracker cards, heatmap — the reader in heat mode, tap a hot word for
    its history.
- **Teacher `/teacher/hifz`** — pairing panel above the register: pick two roster
  students → pair; active pairs and unpaired students listed.
- **Teacher `/teacher/hifz/[studentId]`** — *Overview*: today's page. *Review*:
  the same feedback view the student sees (shared `review-feedback.tsx`).
- **`mushaf-reader.tsx`** — one component, two modes (`logging` | `heat`);
  justified RTL lines in the Hafs font, printed-mushaf breaks, page navigation.

Client components follow the `HifzMarker` idiom: `useTransition`, server action,
`router.refresh()`.

## Verification

Vitest on mushaf grouping, taxonomy/letter extraction, pattern aggregation, and
action guards (non-reviewer can't log; drafts invisible to reciter; no logging
after submit). Component tests for the mistake sheet. Then tsc, `next build`,
regenerate `database.types.ts` via the Management API (LEARNINGS: no CLI), and
push to `main` only after all pass.

## Out of scope

Audio recording, word-timed playback, tajweed-coloured text, QPC per-page glyph
fonts, teacher editing of sessions, heat "cooling" on clean recitations (needs
sessions to record coverage, not just mistakes — the model doesn't block it), and
every HIFZ.md rework item (target units, hizb checks, year scoping).
