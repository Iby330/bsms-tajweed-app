# Hifz Peer Review & Mistake Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teacher-assigned revision pairs where one student logs word-level, categorised mistakes on a mushaf-style Qur'an text while their partner recites; submitted sessions feed a pattern tracker and heatmap visible to the reciter and their teacher.

**Architecture:** Word-by-word Uthmani text (with Madani mushaf page/line numbers) is seeded once from the quran.com v4 API into a `quran_words` table — production never calls the API. Three new user tables (`revision_pairs`, `revision_sessions`, `revision_mistakes`) carry the peer-review state with RLS doing the enforcement (reviewer writes drafts; reciter sees only submitted; teacher read-only except pairs). Pure logic (mushaf line grouping, mistake taxonomy, pattern/heat aggregation) lives in `lib/` under TDD; pages stay server-rendered with `?tab=` params and small client islands for tap-to-log.

**Tech Stack:** Next 16 (app router, server actions), Supabase (RLS, migrations via `execution/apply_migration.ts` — no CLI on this machine), Tailwind 4 + existing glass tokens, vitest + @testing-library/react, tsx scripts in `execution/`.

**Spec:** `docs/superpowers/specs/2026-08-14-hifz-peer-review-design.md`

**Two deviations from the spec, both discovered in the codebase:**
1. **Font** — the app already ships Amiri Quran via `next/font` with the `.ar-quran` class (`globals.css:198`). Use it; no KFGQPC download. Swapping fonts later is CSS-only.
2. **Seed mechanics** — the spec said "emit a seed SQL migration", but `apply_migration.ts` POSTs the whole file as one Management-API request; several thousand insert rows would be an oversized, fragile payload. Instead the seed script upserts in batches through the service-role client (the `seed_demo.ts` pattern). Reproducibility holds: the script is committed and idempotent. Seed scope is chapters **72–114** — the BSMS memorisation run; `surahs` (FK target) only contains those chapters.

**Concurrency warning:** another session has been editing this repo (the hifz target-setting rework landed mid-planning). Before modifying any existing file, re-read it — do not trust this plan's snapshots of `page.tsx` files over what's on disk. New files are safe.

**Journaling:** when a run of `execution/seed_quran_words.ts` or `apply_migration.ts` errors or needs a workaround, append a note via `python execution/skill_journal.py seed_quran_words <error|note> "..."` per workspace rules.

---

## File map

**Create**
- `web/supabase/migrations/0013_hifz_peer_review.sql` — schema + RLS
- `execution/seed_quran_words.ts` — one-off importer
- `web/src/lib/quran/mushaf.ts` + `mushaf.test.ts` — word types, page/line grouping
- `web/src/lib/hifz/mistake-taxonomy.ts` + `.test.ts` — categories, rules, letters, flags
- `web/src/lib/hifz/mistakes.ts` + `.test.ts` — patterns, flags, heat aggregation
- `web/src/lib/hifz/review-queries.ts` — server-side reads (pair, range, feedback)
- `web/src/lib/hifz/review-actions.ts` — server actions (pairs, sessions, mistakes)
- `web/src/components/app/mushaf-reader.tsx` + `.test.tsx` — presentational mushaf
- `web/src/components/app/mistake-sheet.tsx` + `.test.tsx` — tap-a-word dialog
- `web/src/components/app/review-logger.tsx` + `.test.tsx` — live logging island
- `web/src/components/app/start-review-button.tsx` — starts a draft session
- `web/src/components/app/pattern-tracker.tsx` + `.test.tsx` — aggregated list
- `web/src/components/app/heat-viewer.tsx` — heat-mode reader + history dialog
- `web/src/components/app/review-feedback.tsx` — server assembly of feedback view
- `web/src/components/app/review-tab.tsx` — server assembly of student Review tab
- `web/src/components/app/hifz-tabs.tsx` — Overview | Review pill nav
- `web/src/components/app/pairing-panel.tsx` — teacher pair management

**Modify**
- `web/src/lib/reference/cached.ts` — add `getCachedSurahWords`
- `web/src/lib/database.types.ts` — regenerate after migration
- `web/src/app/(student)/hifz/page.tsx` — tabs
- `web/src/app/teacher/hifz/page.tsx` — pairing panel
- `web/src/app/teacher/hifz/[studentId]/page.tsx` — tabs

---

### Task 1: Schema migration + regenerate types

**Files:**
- Create: `web/supabase/migrations/0013_hifz_peer_review.sql`
- Modify: `web/src/lib/database.types.ts` (regenerated, not hand-edited)

- [ ] **Step 1: Write the migration**

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- Hifz peer review: seeded Qur'an words + pairs / sessions / mistakes.
-- Spec: docs/superpowers/specs/2026-08-14-hifz-peer-review-design.md
-- Every statement idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- Word-by-word Uthmani text with Madani mushaf layout. Seeded by
-- execution/seed_quran_words.ts (chapters 72–114, the memorisation run);
-- the app only ever reads it.
create table if not exists quran_words (
  surah_number  int  not null references surahs(number),
  ayah_number   int  not null,
  word_position int  not null,             -- 1-based within the ayah
  text_uthmani  text not null,
  is_end        boolean not null default false,  -- ayah-end marker "word"
  page_number   int  not null,             -- 1..604
  line_number   int  not null,             -- 1..15 within the page
  primary key (surah_number, ayah_number, word_position)
);

create table if not exists revision_pairs (
  id          uuid primary key default gen_random_uuid(),
  student_a   uuid not null references profiles(id),
  student_b   uuid not null references profiles(id),
  assigned_by uuid references profiles(id),
  assigned_at timestamptz not null default now(),
  active      boolean not null default true,
  check (student_a <> student_b)
);
-- Best-effort "one active pair per student" (the assign action retires both
-- students' pairs first; these catch same-column duplicates).
create unique index if not exists uq_revision_pairs_active_a on revision_pairs(student_a) where active;
create unique index if not exists uq_revision_pairs_active_b on revision_pairs(student_b) where active;

create table if not exists revision_sessions (
  id           uuid primary key default gen_random_uuid(),
  reciter_id   uuid not null references profiles(id),
  reviewer_id  uuid not null references profiles(id),
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,                -- null = draft, invisible to reciter
  overall_note text,
  flags        text[] not null default '{}',
  check (reciter_id <> reviewer_id)
);
create index if not exists idx_revision_sessions_reciter  on revision_sessions(reciter_id);
create index if not exists idx_revision_sessions_reviewer on revision_sessions(reviewer_id);

create table if not exists revision_mistakes (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references revision_sessions(id) on delete cascade,
  surah_number  int  not null,
  ayah_number   int  not null,
  word_position int  not null,
  category      text not null check (category in ('hifz','tajweed','makhraj','fluency')),
  detail        text,                      -- rule slug or letter; null = uncategorised
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_revision_mistakes_session on revision_mistakes(session_id);

-- ═══════════ RLS ═══════════
alter table quran_words       enable row level security;
alter table revision_pairs    enable row level security;
alter table revision_sessions enable row level security;
alter table revision_mistakes enable row level security;

-- Reference text: readable by anyone signed in (same as surahs).
drop policy if exists s_quran_words_read on quran_words;
create policy s_quran_words_read on quran_words for select using (auth.uid() is not null);

-- Pairs: teachers manage, members read.
drop policy if exists t_revision_pairs on revision_pairs;
create policy t_revision_pairs on revision_pairs for all
  using (is_teacher()) with check (is_teacher());
drop policy if exists s_pairs_member_read on revision_pairs;
create policy s_pairs_member_read on revision_pairs for select
  using (auth.uid() = student_a or auth.uid() = student_b);

-- Sessions: teacher READ ONLY by design (they view, never edit).
drop policy if exists t_sessions_read on revision_sessions;
create policy t_sessions_read on revision_sessions for select using (is_teacher());
drop policy if exists s_sessions_reviewer_read on revision_sessions;
create policy s_sessions_reviewer_read on revision_sessions for select
  using (reviewer_id = auth.uid());
drop policy if exists s_sessions_reciter_read on revision_sessions;
create policy s_sessions_reciter_read on revision_sessions for select
  using (reciter_id = auth.uid() and submitted_at is not null);
drop policy if exists s_sessions_insert on revision_sessions;
create policy s_sessions_insert on revision_sessions for insert
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from revision_pairs p
      where p.active
        and ((p.student_a = reviewer_id and p.student_b = reciter_id)
          or (p.student_b = reviewer_id and p.student_a = reciter_id))
    )
  );
drop policy if exists s_sessions_update on revision_sessions;
create policy s_sessions_update on revision_sessions for update
  using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());

-- Mistakes: reviewer writes ONLY while the session is a draft; reads split
-- per audience. Teacher read-only.
drop policy if exists t_mistakes_read on revision_mistakes;
create policy t_mistakes_read on revision_mistakes for select using (is_teacher());
drop policy if exists s_mistakes_reviewer_read on revision_mistakes;
create policy s_mistakes_reviewer_read on revision_mistakes for select
  using (exists (select 1 from revision_sessions s
                 where s.id = session_id and s.reviewer_id = auth.uid()));
drop policy if exists s_mistakes_reviewer_insert on revision_mistakes;
create policy s_mistakes_reviewer_insert on revision_mistakes for insert
  with check (exists (select 1 from revision_sessions s
                      where s.id = session_id and s.reviewer_id = auth.uid()
                        and s.submitted_at is null));
drop policy if exists s_mistakes_reviewer_delete on revision_mistakes;
create policy s_mistakes_reviewer_delete on revision_mistakes for delete
  using (exists (select 1 from revision_sessions s
                 where s.id = session_id and s.reviewer_id = auth.uid()
                   and s.submitted_at is null));
drop policy if exists s_mistakes_reciter_read on revision_mistakes;
create policy s_mistakes_reciter_read on revision_mistakes for select
  using (exists (select 1 from revision_sessions s
                 where s.id = session_id and s.reciter_id = auth.uid()
                   and s.submitted_at is not null));
```

- [ ] **Step 2: Apply it**

Run (from repo root): `npx tsx execution/apply_migration.ts web/supabase/migrations/0013_hifz_peer_review.sql`
Expected: HTTP 201, migration recorded in `schema_migrations`. Non-2xx = failure — read the `message`, fix, re-run (statements are idempotent).

- [ ] **Step 3: Regenerate `database.types.ts`**

```bash
cd "/Users/ibrahimramadan/BSMS Tajweed app"
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN' .env | cut -d= -f2)
curl -s "https://api.supabase.com/v1/projects/ssqeakiutclbiwizrchh/types/typescript" \
  -H "Authorization: Bearer $TOKEN" | jq -r .types > web/src/lib/database.types.ts
```

Known quirks (LEARNINGS.md): the output drops the old `graphql_public` block (harmless) and includes revoked views (also harmless). Verify the new tables landed: `grep -c "revision_pairs\|revision_sessions\|revision_mistakes\|quran_words" web/src/lib/database.types.ts` → non-zero.

- [ ] **Step 4: Type-check the app still compiles**

Run: `cd web && npx tsc --noEmit`
Expected: clean (a stale-types symptom would be `SelectQueryError` at property accesses).

- [ ] **Step 5: Commit**

```bash
git add web/supabase/migrations/0013_hifz_peer_review.sql web/src/lib/database.types.ts
git commit -m "feat(hifz): peer-review schema — quran words, pairs, sessions, mistakes"
```

---

### Task 2: Seed the Qur'an words

**Files:**
- Create: `execution/seed_quran_words.ts`

- [ ] **Step 1: Write the script**

```ts
/**
 * seed_quran_words.ts — import word-by-word Uthmani text with Madani mushaf
 * page/line layout from the quran.com v4 API into `quran_words`.
 *
 * Scope: chapters 72..114 — the BSMS memorisation run (An-Nas ← Al-Jinn),
 * matching the `surahs` table the FK points at.
 * Run:  npx tsx execution/seed_quran_words.ts
 * Idempotent: upserts on (surah_number, ayah_number, word_position).
 * One-off operational tooling — production NEVER calls quran.com.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, "web/.env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const API = "https://api.quran.com/api/v4/verses/by_chapter";

type ApiWord = {
  position: number;
  char_type_name: string; // "word" | "end"
  text_uthmani: string;
  page_number: number;
  line_number: number;
};
type ApiVerse = { verse_number: number; words: ApiWord[] };

async function fetchChapter(n: number): Promise<ApiVerse[]> {
  const verses: ApiVerse[] = [];
  for (let page = 1; ; page++) {
    const url =
      `${API}/${n}?words=true&word_fields=text_uthmani,page_number,line_number,char_type_name` +
      `&per_page=50&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`chapter ${n} page ${page}: HTTP ${res.status}`);
    const json = (await res.json()) as { verses: ApiVerse[]; pagination: { next_page: number | null } };
    verses.push(...json.verses);
    if (!json.pagination.next_page) break;
  }
  return verses;
}

async function main() {
  const rows: Record<string, unknown>[] = [];
  for (let n = 72; n <= 114; n++) {
    const verses = await fetchChapter(n);
    for (const v of verses) {
      for (const w of v.words) {
        if (!w.text_uthmani || !w.page_number || !w.line_number)
          throw new Error(`chapter ${n} ayah ${v.verse_number}: incomplete word ${JSON.stringify(w)}`);
        rows.push({
          surah_number: n,
          ayah_number: v.verse_number,
          word_position: w.position,
          text_uthmani: w.text_uthmani,
          is_end: w.char_type_name === "end",
          page_number: w.page_number,
          line_number: w.line_number,
        });
      }
    }
    console.log(`chapter ${n}: ${verses.length} ayahs`);
  }
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db.from("quran_words").upsert(rows.slice(i, i + 1000));
    if (error) throw new Error(`upsert batch at ${i}: ${error.message}`);
  }
  console.log(`seeded ${rows.length} words across chapters 72–114`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

(Body stays inside `main()` — `tsx` outside `web/` compiles CJS and rejects top-level await; see LEARNINGS.md.)

- [ ] **Step 2: Run it**

Run: `cd "/Users/ibrahimramadan/BSMS Tajweed app" && npx tsx execution/seed_quran_words.ts`
Expected: one line per chapter, then `seeded N words` with N ≈ 6,000–7,000.

- [ ] **Step 3: Verify against the live DB**

```bash
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN' .env | cut -d= -f2)
curl -s -X POST "https://api.supabase.com/v1/projects/ssqeakiutclbiwizrchh/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select count(*) words, count(distinct surah_number) surahs, min(page_number) pmin, max(page_number) pmax from quran_words"}'
```

Expected: `surahs` = 43, `pmin` = 572, `pmax` = 604, `words` matching the script's count.

- [ ] **Step 4: Commit**

```bash
git add execution/seed_quran_words.ts
git commit -m "feat(hifz): seed word-by-word quran text with mushaf layout (72-114)"
```

---

### Task 3: Mushaf grouping (`lib/quran/mushaf.ts`)

**Files:**
- Create: `web/src/lib/quran/mushaf.ts`
- Test: `web/src/lib/quran/mushaf.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { fromRow, groupIntoPages, wordKey, type QuranWord } from "./mushaf";

const w = (over: Partial<QuranWord>): QuranWord => ({
  surah: 114, ayah: 1, position: 1, text: "قُلْ", isEnd: false, page: 604, line: 12, ...over,
});

describe("wordKey", () => {
  it("is surah:ayah:position", () => {
    expect(wordKey({ surah: 114, ayah: 2, position: 3 })).toBe("114:2:3");
  });
});

describe("fromRow", () => {
  it("maps DB column names to the word shape", () => {
    expect(fromRow({
      surah_number: 114, ayah_number: 1, word_position: 5,
      text_uthmani: "١", is_end: true, page_number: 604, line_number: 12,
    })).toEqual({ surah: 114, ayah: 1, position: 5, text: "١", isEnd: true, page: 604, line: 12 });
  });
});

describe("groupIntoPages", () => {
  it("returns no pages for no words", () => {
    expect(groupIntoPages([])).toEqual([]);
  });
  it("groups consecutive words into lines and pages, preserving order", () => {
    const words = [
      w({ position: 1, line: 12 }), w({ position: 2, line: 12 }),
      w({ ayah: 2, position: 1, line: 13 }),
      w({ ayah: 3, position: 1, page: 605, line: 1 }),
    ];
    const pages = groupIntoPages(words);
    expect(pages.map((p) => p.page)).toEqual([604, 605]);
    expect(pages[0].lines.map((l) => l.line)).toEqual([12, 13]);
    expect(pages[0].lines[0].words.map((x) => x.position)).toEqual([1, 2]);
    expect(pages[1].lines[0].words[0].ayah).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd web && npx vitest run src/lib/quran/mushaf.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/** One word of the seeded Uthmani text, positioned in the Madani mushaf. */
export type QuranWord = {
  surah: number;
  ayah: number;
  position: number; // 1-based within the ayah
  text: string;
  isEnd: boolean;   // ayah-end marker (the numeral)
  page: number;
  line: number;
};

export type QuranWordRow = {
  surah_number: number;
  ayah_number: number;
  word_position: number;
  text_uthmani: string;
  is_end: boolean;
  page_number: number;
  line_number: number;
};

export type MushafLine = { line: number; words: QuranWord[] };
export type MushafPage = { page: number; lines: MushafLine[] };

export const wordKey = (w: Pick<QuranWord, "surah" | "ayah" | "position">): string =>
  `${w.surah}:${w.ayah}:${w.position}`;

export const fromRow = (r: QuranWordRow): QuranWord => ({
  surah: r.surah_number, ayah: r.ayah_number, position: r.word_position,
  text: r.text_uthmani, isEnd: r.is_end, page: r.page_number, line: r.line_number,
});

/** DB order (ayah asc, position asc) IS mushaf reading order within a surah;
 *  grouping by consecutive page/line values reproduces the printed lines. */
export function groupIntoPages(words: QuranWord[]): MushafPage[] {
  const pages: MushafPage[] = [];
  for (const w of words) {
    let page = pages[pages.length - 1];
    if (!page || page.page !== w.page) {
      page = { page: w.page, lines: [] };
      pages.push(page);
    }
    let line = page.lines[page.lines.length - 1];
    if (!line || line.line !== w.line) {
      line = { line: w.line, words: [] };
      page.lines.push(line);
    }
    line.words.push(w);
  }
  return pages;
}
```

- [ ] **Step 4: Run to verify pass** — same command → PASS.

- [ ] **Step 5: Commit** — `git add web/src/lib/quran && git commit -m "feat(hifz): mushaf page/line grouping for seeded quran words"`

---

### Task 4: Mistake taxonomy (`lib/hifz/mistake-taxonomy.ts`)

**Files:**
- Create: `web/src/lib/hifz/mistake-taxonomy.ts`
- Test: `web/src/lib/hifz/mistake-taxonomy.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { CATEGORIES, DETAILS, SESSION_FLAGS, detailLabel, flagLabel, lettersOf } from "./mistake-taxonomy";

describe("taxonomy shape", () => {
  it("has the four categories", () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(["hifz", "tajweed", "makhraj", "fluency"]);
  });
  it("gives every non-makhraj category a detail list", () => {
    expect(DETAILS.hifz.length).toBeGreaterThan(0);
    expect(DETAILS.tajweed.map((d) => d.id)).toContain("ikhfa");
    expect(DETAILS.fluency.length).toBeGreaterThan(0);
  });
  it("has session flags including weak hifz", () => {
    expect(SESSION_FLAGS.map((f) => f.id)).toContain("weak_hifz");
  });
});

describe("lettersOf", () => {
  it("strips diacritics down to base letters", () => {
    expect(lettersOf("قُلْ")).toEqual(["ق", "ل"]);
  });
  it("normalises alif variants and dedupes", () => {
    expect(lettersOf("ٱلنَّاسِ")).toEqual(["ا", "ل", "ن", "س"]);
  });
  it("returns nothing for ayah-end numerals", () => {
    expect(lettersOf("١")).toEqual([]);
  });
});

describe("labels", () => {
  it("labels a tajweed rule", () => {
    expect(detailLabel("tajweed", "ikhfa")).toBe("Tajweed — Ikhfa");
  });
  it("labels a makhraj letter with the letter itself", () => {
    expect(detailLabel("makhraj", "ض")).toBe("Makhraj of ض");
  });
  it("falls back to the category for null detail", () => {
    expect(detailLabel("hifz", null)).toBe("Hifz");
  });
  it("labels flags", () => {
    expect(flagLabel("weak_hifz")).toBe("Weak hifz overall");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/hifz/mistake-taxonomy.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
/** The mistake vocabulary for peer review. Curated, not exhaustive — chips
 *  must be scannable mid-recitation. Stored values are the ids; labels are
 *  presentation. Changing an id orphans stored rows — add, don't rename. */

export const CATEGORIES = [
  { id: "hifz", label: "Hifz" },
  { id: "tajweed", label: "Tajweed" },
  { id: "makhraj", label: "Makhraj" },
  { id: "fluency", label: "Fluency" },
] as const;
export type Category = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS: readonly string[] = CATEGORIES.map((c) => c.id);

export const DETAILS: Record<Exclude<Category, "makhraj">, { id: string; label: string }[]> = {
  hifz: [
    { id: "forgot", label: "Forgot the word" },
    { id: "swapped", label: "Swapped / wrong word" },
    { id: "added", label: "Added a word" },
  ],
  tajweed: [
    { id: "ikhfa", label: "Ikhfa" },
    { id: "idgham", label: "Idgham" },
    { id: "iqlab", label: "Iqlab" },
    { id: "izhar", label: "Izhar" },
    { id: "qalqalah", label: "Qalqalah" },
    { id: "madd", label: "Madd length" },
    { id: "ghunnah", label: "Ghunnah" },
    { id: "tafkhim", label: "Heavy / light (tafkhim–tarqiq)" },
  ],
  fluency: [
    { id: "hesitation", label: "Hesitation" },
    { id: "repetition", label: "Repetition" },
  ],
};

/** Session-level observations that aren't anchored to one word. */
export const SESSION_FLAGS = [
  { id: "weak_hifz", label: "Weak hifz overall" },
  { id: "halting", label: "Halting — needs more revision" },
  { id: "strong", label: "Strong recitation" },
] as const;

const LETTER_NORMALISE: Record<string, string> = { "ٱ": "ا", "أ": "ا", "إ": "ا", "آ": "ا" };
const ARABIC_LETTER = /[ء-يٱ]/; // base letters only — tashkeel is ً+

/** Base letters of a word, reading order, deduped — the makhraj chip list. */
export function lettersOf(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ch of text) {
    if (!ARABIC_LETTER.test(ch)) continue;
    const base = LETTER_NORMALISE[ch] ?? ch;
    if (!seen.has(base)) {
      seen.add(base);
      out.push(base);
    }
  }
  return out;
}

/** Human label for a stored (category, detail) pair. */
export function detailLabel(category: Category, detail: string | null): string {
  const cat = CATEGORIES.find((c) => c.id === category)?.label ?? category;
  if (!detail) return cat;
  if (category === "makhraj") return `Makhraj of ${detail}`;
  const d = DETAILS[category as Exclude<Category, "makhraj">]?.find((x) => x.id === detail);
  return d ? `${cat} — ${d.label}` : cat;
}

export function flagLabel(flag: string): string {
  return SESSION_FLAGS.find((f) => f.id === flag)?.label ?? flag;
}
```

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat(hifz): mistake taxonomy — categories, rules, letters, session flags"`

---

### Task 5: Aggregation (`lib/hifz/mistakes.ts`)

**Files:**
- Create: `web/src/lib/hifz/mistakes.ts`
- Test: `web/src/lib/hifz/mistakes.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { aggregateFlags, aggregatePatterns, heatClass, wordHeat, type MistakeRow, type SessionRow } from "./mistakes";

const NOW = new Date("2026-08-14T12:00:00Z");
const m = (over: Partial<MistakeRow>): MistakeRow => ({
  id: "m1", session_id: "s1", surah_number: 114, ayah_number: 1, word_position: 2,
  category: "tajweed", detail: "ikhfa", note: null, created_at: "2026-08-10T10:00:00Z", ...over,
});

describe("aggregatePatterns", () => {
  it("groups by category+detail with counts, surah spread and recency", () => {
    const rows = [
      m({ id: "a" }),
      m({ id: "b", surah_number: 112, created_at: "2026-05-01T10:00:00Z" }),
      m({ id: "c", category: "makhraj", detail: "ض" }),
    ];
    const out = aggregatePatterns(rows, NOW);
    expect(out).toHaveLength(2);
    const ikhfa = out.find((p) => p.detail === "ikhfa")!;
    expect(ikhfa.total).toBe(2);
    expect(ikhfa.recent).toBe(1); // May is outside the 28-day window
    expect(ikhfa.surahs).toEqual([114, 112]);
    expect(ikhfa.label).toBe("Tajweed — Ikhfa");
  });
  it("sorts most recently active first", () => {
    const out = aggregatePatterns(
      [m({ id: "old", detail: "madd", created_at: "2026-01-01T00:00:00Z" }), m({ id: "new" })],
      NOW,
    );
    expect(out[0].detail).toBe("ikhfa");
  });
});

describe("aggregateFlags", () => {
  it("counts flags over the last five submitted sessions", () => {
    const s = (id: string, at: string, flags: string[]): SessionRow =>
      ({ id, submitted_at: at, flags, overall_note: null });
    const out = aggregateFlags([
      s("1", "2026-08-01T00:00:00Z", ["weak_hifz"]),
      s("2", "2026-08-08T00:00:00Z", ["weak_hifz", "halting"]),
      s("3", "2026-08-13T00:00:00Z", []),
    ]);
    expect(out[0]).toMatchObject({ flag: "weak_hifz", count: 2, ofLast: 3 });
  });
  it("ignores drafts", () => {
    expect(aggregateFlags([{ id: "d", submitted_at: null, flags: ["weak_hifz"], overall_note: null }])).toEqual([]);
  });
});

describe("wordHeat", () => {
  it("weights recent mistakes double", () => {
    const heat = wordHeat([m({}), m({ id: "old2", created_at: "2026-01-01T00:00:00Z" })], NOW);
    expect(heat["114:1:2"]).toBe(3); // 2 recent + 1 old
  });
});

describe("heatClass", () => {
  it("maps intensity to tint classes", () => {
    expect(heatClass(0)).toBe("");
    expect(heatClass(2)).toBe("bg-warn/20");
    expect(heatClass(4)).toBe("bg-warn/40");
    expect(heatClass(7)).toBe("bg-danger/40");
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

```ts
import { wordKey } from "@/lib/quran/mushaf";
import { detailLabel, flagLabel, type Category } from "./mistake-taxonomy";

export type MistakeRow = {
  id: string;
  session_id: string;
  surah_number: number;
  ayah_number: number;
  word_position: number;
  category: Category;
  detail: string | null;
  note: string | null;
  created_at: string;
};

export type SessionRow = {
  id: string;
  submitted_at: string | null;
  flags: string[];
  overall_note: string | null;
};

const RECENT_MS = 28 * 24 * 60 * 60 * 1000;
const isRecent = (createdAt: string, now: Date) =>
  now.getTime() - new Date(createdAt).getTime() <= RECENT_MS;

export type Pattern = {
  category: Category;
  detail: string | null;
  label: string;
  total: number;
  recent: number;      // last 28 days
  surahs: number[];    // distinct, first-seen order
  lastSeen: string;
};

/** Mistakes → recurring patterns ("Tajweed — Ikhfa · 7× across 3 surahs"),
 *  most recently active first. */
export function aggregatePatterns(mistakes: MistakeRow[], now: Date): Pattern[] {
  const byKey = new Map<string, Pattern>();
  for (const m of mistakes) {
    const key = `${m.category}|${m.detail ?? ""}`;
    let p = byKey.get(key);
    if (!p) {
      p = {
        category: m.category, detail: m.detail, label: detailLabel(m.category, m.detail),
        total: 0, recent: 0, surahs: [], lastSeen: m.created_at,
      };
      byKey.set(key, p);
    }
    p.total += 1;
    if (isRecent(m.created_at, now)) p.recent += 1;
    if (!p.surahs.includes(m.surah_number)) p.surahs.push(m.surah_number);
    if (m.created_at > p.lastSeen) p.lastSeen = m.created_at;
  }
  return [...byKey.values()].sort(
    (a, b) => b.recent - a.recent || b.total - a.total || b.lastSeen.localeCompare(a.lastSeen),
  );
}

export type FlagPattern = { flag: string; label: string; count: number; ofLast: number };

/** Session flags over the last (up to) five submitted sessions —
 *  "weak hifz in 3 of last 5". */
export function aggregateFlags(sessions: SessionRow[]): FlagPattern[] {
  const submitted = sessions
    .filter((s) => s.submitted_at)
    .sort((a, b) => b.submitted_at!.localeCompare(a.submitted_at!))
    .slice(0, 5);
  const counts = new Map<string, number>();
  for (const s of submitted) for (const f of s.flags) counts.set(f, (counts.get(f) ?? 0) + 1);
  return [...counts.entries()]
    .map(([flag, count]) => ({ flag, label: flagLabel(flag), count, ofLast: submitted.length }))
    .sort((a, b) => b.count - a.count);
}

/** Per-word heat: 2 per mistake in the last 28 days, 1 for older ones. */
export function wordHeat(mistakes: MistakeRow[], now: Date): Record<string, number> {
  const heat: Record<string, number> = {};
  for (const m of mistakes) {
    const key = wordKey({ surah: m.surah_number, ayah: m.ayah_number, position: m.word_position });
    heat[key] = (heat[key] ?? 0) + (isRecent(m.created_at, now) ? 2 : 1);
  }
  return heat;
}

/** Tint for a heat value; empty when cold. Thresholds are presentation. */
export function heatClass(intensity: number): string {
  if (intensity <= 0) return "";
  if (intensity <= 2) return "bg-warn/20";
  if (intensity <= 4) return "bg-warn/40";
  return "bg-danger/40";
}
```

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat(hifz): mistake pattern, flag and heat aggregation"`

---

### Task 6: Data access — cached words, queries, actions

**Files:**
- Modify: `web/src/lib/reference/cached.ts` (append)
- Create: `web/src/lib/hifz/review-queries.ts`
- Create: `web/src/lib/hifz/review-actions.ts`

No unit tests here — this layer is thin wiring over RLS; the gate is `tsc` plus Task 12's manual walkthrough. Guard logic that CAN be pure already lives in Tasks 4–5.

- [ ] **Step 1: Append to `cached.ts`** (it is reference data, universally readable — same contract as `getCachedSurahs`; `unstable_cache` keys on the argument):

```ts
export const getCachedSurahWords = unstable_cache(
  async (surahNumber: number) => {
    const { data, error } = await supabaseAdmin()
      .from("quran_words")
      .select("surah_number, ayah_number, word_position, text_uthmani, is_end, page_number, line_number")
      .eq("surah_number", surahNumber)
      .order("ayah_number")
      .order("word_position");
    if (error) throw error;
    return data ?? [];
  },
  ["ref-quran-words"],
  { tags: ["reference"], revalidate: 3600 },
);
```

- [ ] **Step 2: Write `review-queries.ts`**

```ts
import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCachedSurahs } from "@/lib/reference/cached";
import { memorisationList, type Surah } from "@/lib/hifz/pace";
import type { MistakeRow, SessionRow } from "./mistakes";

export type ActivePair = { pairId: string; partnerId: string; partnerName: string };

/** The caller's active revision pair. RLS scopes the pair read to rows naming
 *  them; the partner's NAME goes through the admin client because students
 *  cannot read each other's profiles — the pair row is the authorisation. */
export async function myActivePair(userId: string): Promise<ActivePair | null> {
  const db = await supabaseServer();
  const { data: pair } = await db
    .from("revision_pairs")
    .select("id, student_a, student_b")
    .eq("active", true)
    .or(`student_a.eq.${userId},student_b.eq.${userId}`)
    .maybeSingle();
  if (!pair) return null;
  const partnerId = pair.student_a === userId ? pair.student_b : pair.student_a;
  const { data: partner } = await supabaseAdmin()
    .from("profiles").select("full_name").eq("id", partnerId).maybeSingle();
  return { pairId: pair.id, partnerId, partnerName: partner?.full_name ?? "your partner" };
}

export type RangeSurah = {
  number: number; name_en: string; name_ar: string; passed: boolean; current: boolean;
};

/** The partner's memorised range: passed surahs + the one in progress.
 *  Admin reads — ONLY call with a partnerId that came out of myActivePair(). */
export async function partnerRange(partnerId: string): Promise<RangeSurah[]> {
  const admin = supabaseAdmin();
  const [surahs, { data: hp }, { data: records }] = await Promise.all([
    getCachedSurahs(),
    admin.from("hifz_profiles").select("start_surah, target_count").eq("student_id", partnerId).maybeSingle(),
    admin.from("hifz_records").select("surah_number").eq("student_id", partnerId),
  ]);
  if (!hp) return [];
  const passed = new Set((records ?? []).map((r) => r.surah_number));
  const list = memorisationList(hp.start_surah, hp.target_count, surahs as Surah[]);
  const current = list.find((s) => !passed.has(s.number))?.number ?? null;
  return list
    .filter((s) => passed.has(s.number) || s.number === current)
    .map((s) => ({
      number: s.number, name_en: s.name_en, name_ar: s.name_ar,
      passed: passed.has(s.number), current: s.number === current,
    }));
}

/** The caller's open draft against this reciter, if any. */
export async function myDraftSession(
  reviewerId: string, reciterId: string,
): Promise<{ id: string } | null> {
  const db = await supabaseServer();
  const { data } = await db
    .from("revision_sessions").select("id")
    .eq("reviewer_id", reviewerId).eq("reciter_id", reciterId)
    .is("submitted_at", null)
    .maybeSingle();
  return data ? { id: data.id } : null;
}

export async function draftMistakes(sessionId: string): Promise<MistakeRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from("revision_mistakes")
    .select("id, session_id, surah_number, ayah_number, word_position, category, detail, note, created_at")
    .eq("session_id", sessionId);
  return (data ?? []) as MistakeRow[];
}

export type Feedback = {
  sessions: (SessionRow & { reviewerName: string })[];
  mistakes: MistakeRow[];
};

/** Everything submitted about a student. Reads run as the CALLER, so RLS
 *  decides visibility (works for the reciter and for teachers); reviewer
 *  names go through admin because profiles aren't cross-readable. */
export async function feedbackFor(studentId: string): Promise<Feedback> {
  const db = await supabaseServer();
  const { data: sessions } = await db
    .from("revision_sessions")
    .select("id, reviewer_id, submitted_at, flags, overall_note")
    .eq("reciter_id", studentId)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false });
  if (!sessions?.length) return { sessions: [], mistakes: [] };

  const ids = sessions.map((s) => s.id);
  const [{ data: mistakes }, { data: names }] = await Promise.all([
    db.from("revision_mistakes")
      .select("id, session_id, surah_number, ayah_number, word_position, category, detail, note, created_at")
      .in("session_id", ids),
    supabaseAdmin().from("profiles").select("id, full_name")
      .in("id", [...new Set(sessions.map((s) => s.reviewer_id))]),
  ]);
  const nameOf = new Map((names ?? []).map((p) => [p.id, p.full_name]));
  return {
    sessions: sessions.map((s) => ({
      id: s.id, submitted_at: s.submitted_at, flags: s.flags ?? [],
      overall_note: s.overall_note, reviewerName: nameOf.get(s.reviewer_id) ?? "Classmate",
    })),
    mistakes: (mistakes ?? []) as MistakeRow[],
  };
}
```

- [ ] **Step 3: Write `review-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { teacherRoster } from "@/lib/teacher/scope";
import { CATEGORY_IDS, SESSION_FLAGS, type Category } from "./mistake-taxonomy";

async function requireTeacher() {
  const profile = await currentProfile();
  if (!profile || profile.role !== "teacher") throw new Error("Teachers only.");
  return profile;
}

async function requireUser() {
  const profile = await currentProfile();
  if (!profile) throw new Error("Sign in first.");
  return profile;
}

/** Pair two roster students, retiring any active pair either is already in —
 *  one active pair per student. Stored ordered (a < b) for the unique indexes. */
export async function assignPair(studentA: string, studentB: string): Promise<void> {
  const teacher = await requireTeacher();
  if (studentA === studentB) throw new Error("A pair needs two different students.");
  const roster = await teacherRoster();
  const ids = new Set(roster.map((s) => s.id));
  if (!ids.has(studentA) || !ids.has(studentB)) throw new Error("Not your students.");

  const db = await supabaseServer();
  const { error: retireErr } = await db
    .from("revision_pairs")
    .update({ active: false })
    .eq("active", true)
    .or(`student_a.in.(${studentA},${studentB}),student_b.in.(${studentA},${studentB})`);
  if (retireErr) throw new Error(retireErr.message);

  const [a, b] = [studentA, studentB].sort();
  const { error } = await db
    .from("revision_pairs")
    .insert({ student_a: a, student_b: b, assigned_by: teacher.id });
  if (error) throw new Error(error.message);
  revalidatePath("/teacher/hifz");
  revalidatePath("/hifz");
}

export async function unassignPair(pairId: string): Promise<void> {
  await requireTeacher();
  const db = await supabaseServer();
  const { error } = await db.from("revision_pairs").update({ active: false }).eq("id", pairId);
  if (error) throw new Error(error.message);
  revalidatePath("/teacher/hifz");
  revalidatePath("/hifz");
}

/** Open (or resume) a draft session reviewing `reciterId`. RLS re-checks the
 *  active pair on insert; the pre-check exists for a readable error. */
export async function startSession(reciterId: string): Promise<string> {
  const me = await requireUser();
  const db = await supabaseServer();

  const { data: existing } = await db
    .from("revision_sessions").select("id")
    .eq("reviewer_id", me.id).eq("reciter_id", reciterId)
    .is("submitted_at", null).maybeSingle();
  if (existing) return existing.id;

  const { data: pair } = await db
    .from("revision_pairs").select("id").eq("active", true)
    .or(`and(student_a.eq.${me.id},student_b.eq.${reciterId}),and(student_a.eq.${reciterId},student_b.eq.${me.id})`)
    .maybeSingle();
  if (!pair) throw new Error("You're not paired with this student.");

  const { data, error } = await db
    .from("revision_sessions")
    .insert({ reviewer_id: me.id, reciter_id: reciterId })
    .select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/hifz");
  return data.id;
}

export type MistakeLocation = { surah: number; ayah: number; position: number };

/** One mistake per word per session: logging replaces any earlier
 *  classification of the same word. RLS (reviewer + draft) guards both
 *  statements. Returns the new row id so the client can undo it. */
export async function logMistake(
  sessionId: string,
  loc: MistakeLocation,
  category: Category,
  detail?: string,
  note?: string,
): Promise<string> {
  await requireUser();
  if (!CATEGORY_IDS.includes(category)) throw new Error("Unknown category.");
  const db = await supabaseServer();

  const { error: delErr } = await db
    .from("revision_mistakes").delete()
    .eq("session_id", sessionId)
    .eq("surah_number", loc.surah).eq("ayah_number", loc.ayah).eq("word_position", loc.position);
  if (delErr) throw new Error(delErr.message);

  const { data, error } = await db
    .from("revision_mistakes")
    .insert({
      session_id: sessionId,
      surah_number: loc.surah, ayah_number: loc.ayah, word_position: loc.position,
      category, detail: detail || null, note: note?.trim() || null,
    })
    .select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function removeMistake(mistakeId: string): Promise<void> {
  await requireUser();
  const db = await supabaseServer();
  const { error } = await db.from("revision_mistakes").delete().eq("id", mistakeId);
  if (error) throw new Error(error.message);
}

const FLAG_IDS: readonly string[] = SESSION_FLAGS.map((f) => f.id);

export async function submitSession(
  sessionId: string, flags: string[], overallNote?: string,
): Promise<void> {
  await requireUser();
  if (flags.some((f) => !FLAG_IDS.includes(f))) throw new Error("Unknown flag.");
  const db = await supabaseServer();
  const { data, error } = await db
    .from("revision_sessions")
    .update({
      submitted_at: new Date().toISOString(),
      flags,
      overall_note: overallNote?.trim() || null,
    })
    .eq("id", sessionId).is("submitted_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Session already submitted or not yours.");
  revalidatePath("/hifz");
  revalidatePath("/teacher/hifz");
}
```

- [ ] **Step 4: Type-check** — `cd web && npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit** — `git add web/src/lib/reference/cached.ts web/src/lib/hifz/review-queries.ts web/src/lib/hifz/review-actions.ts && git commit -m "feat(hifz): review data access — cached words, pair/session queries, actions"`

---

### Task 7: MushafReader component

**Files:**
- Create: `web/src/components/app/mushaf-reader.tsx`
- Test: `web/src/components/app/mushaf-reader.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MushafReader } from "./mushaf-reader";
import { groupIntoPages, type QuranWord } from "@/lib/quran/mushaf";

const w = (over: Partial<QuranWord>): QuranWord => ({
  surah: 114, ayah: 1, position: 1, text: "قُلْ", isEnd: false, page: 604, line: 12, ...over,
});
// 5 words + end marker on one line so the line renders justified
const line = [
  w({}), w({ position: 2, text: "أَعُوذُ" }), w({ position: 3, text: "بِرَبِّ" }),
  w({ position: 4, text: "ٱلنَّاسِ" }), w({ position: 5, text: "١", isEnd: true }),
  w({ ayah: 2, position: 1, text: "مَلِكِ", line: 13 }),
];

describe("MushafReader", () => {
  it("renders pages, lines and words in order", () => {
    const { container } = render(<MushafReader pages={groupIntoPages(line)} />);
    expect(container.textContent).toContain("page 604");
    expect(container.textContent).toContain("قُلْ");
    expect(container.querySelectorAll("[dir='rtl']")).toHaveLength(2); // two lines
  });
  it("end markers are not tappable; words are when onWordTap given", () => {
    const onTap = vi.fn();
    const { container } = render(<MushafReader pages={groupIntoPages(line)} onWordTap={onTap} />);
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(5); // 6 tokens minus the end marker
    fireEvent.click(buttons[0]);
    expect(onTap).toHaveBeenCalledWith(expect.objectContaining({ ayah: 1, position: 1 }));
  });
  it("applies mark and heat tints by word key", () => {
    const { container } = render(
      <MushafReader pages={groupIntoPages(line)}
        marks={{ "114:1:2": { category: "tajweed" } }}
        heat={{ "114:2:1": "bg-warn/40" }} />,
    );
    expect(container.querySelector(".bg-danger\\/25")?.textContent).toBe("أَعُوذُ");
    expect(container.querySelector(".bg-warn\\/40")?.textContent).toBe("مَلِكِ");
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

```tsx
"use client";

import { wordKey, type MushafPage, type QuranWord } from "@/lib/quran/mushaf";
import { cn } from "@/lib/utils";

export type WordMark = { category: string };

/**
 * The mushaf, one printed line per row. Presentational only — logging and
 * heat views both drive it. Lines justify like the printed page; short lines
 * (surah endings) centre instead of stretching two words across the width.
 */
export function MushafReader({
  pages,
  marks = {},
  heat = {},
  onWordTap,
}: {
  pages: MushafPage[];
  marks?: Record<string, WordMark>;   // wordKey → logged mistake (uniform tint)
  heat?: Record<string, string>;      // wordKey → precomputed tint class
  onWordTap?: (word: QuranWord) => void;
}) {
  return (
    <div className="space-y-4">
      {pages.map((p) => (
        <section key={p.page} className="glass rounded-2xl px-4 py-5">
          <p className="mb-3 text-center text-[11px] tabular-nums text-muted-foreground">
            page {p.page}
          </p>
          <div className="space-y-1">
            {p.lines.map((ln) => (
              <div
                key={ln.line}
                dir="rtl"
                lang="ar"
                className={cn(
                  "ar-quran flex flex-wrap gap-y-1",
                  ln.words.length >= 5 ? "justify-between" : "justify-center gap-x-3",
                )}
              >
                {ln.words.map((word) => {
                  const key = wordKey(word);
                  if (word.isEnd) {
                    return (
                      <span key={key}
                        className="self-center rounded-full border border-line px-1.5 text-[0.55em] leading-6 text-muted-foreground">
                        {word.text}
                      </span>
                    );
                  }
                  if (!onWordTap) {
                    return (
                      <span key={key} className={cn("rounded-md px-0.5", marks[key] && "bg-danger/25", heat[key])}>
                        {word.text}
                      </span>
                    );
                  }
                  return (
                    <button key={key} type="button" onClick={() => onWordTap(word)}
                      className={cn("rounded-md px-0.5 transition-colors hover:bg-muted",
                        marks[key] && "bg-danger/25", heat[key])}>
                      {word.text}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

Wait — heat mode needs taps too (to open history). The test above expects buttons only when `onWordTap` is provided, which holds for both modes. No change needed.

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat(hifz): mushaf reader — printed-line layout, tappable words, tints"`

---

### Task 8: MistakeSheet component

**Files:**
- Create: `web/src/components/app/mistake-sheet.tsx`
- Test: `web/src/components/app/mistake-sheet.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { MistakeSheet } from "./mistake-sheet";
import type { QuranWord } from "@/lib/quran/mushaf";

const word: QuranWord = {
  surah: 114, ayah: 1, position: 4, text: "ٱلنَّاسِ", isEnd: false, page: 604, line: 12,
};

describe("MistakeSheet", () => {
  it("saves category + detail + note", () => {
    const onSave = vi.fn();
    render(<MistakeSheet word={word} onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Tajweed" }));
    fireEvent.click(screen.getByRole("button", { name: "Ikhfa" }));
    fireEvent.change(screen.getByPlaceholderText(/note/i), { target: { value: "rushed it" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ category: "tajweed", detail: "ikhfa", note: "rushed it" });
  });
  it("offers the tapped word's letters for makhraj", () => {
    render(<MistakeSheet word={word} onSave={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Makhraj" }));
    expect(screen.getByRole("button", { name: "ن" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "س" })).toBeTruthy();
  });
  it("save is disabled until a category is picked, and remove shows for existing marks", () => {
    const onRemove = vi.fn();
    render(<MistakeSheet word={word} onSave={() => {}} onRemove={onRemove} onClose={() => {}}
      existing={{ category: "hifz", detail: "forgot", note: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

```tsx
"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORIES, DETAILS, lettersOf, type Category } from "@/lib/hifz/mistake-taxonomy";
import type { QuranWord } from "@/lib/quran/mushaf";
import { cn } from "@/lib/utils";

export type SheetResult = { category: Category; detail: string | null; note: string };

/**
 * The two-level quick pick for one tapped word: category → specific (rule /
 * letter / slip) → optional note. Mount with key={wordKey(word)} so state
 * resets per word.
 */
export function MistakeSheet({
  word,
  existing,
  onSave,
  onRemove,
  onClose,
}: {
  word: QuranWord | null;
  existing?: { category: Category; detail: string | null; note: string | null };
  onSave: (r: SheetResult) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<Category | null>(existing?.category ?? null);
  const [detail, setDetail] = useState<string | null>(existing?.detail ?? null);
  const [note, setNote] = useState(existing?.note ?? "");

  const details =
    category === "makhraj"
      ? (word ? lettersOf(word.text).map((l) => ({ id: l, label: l })) : [])
      : category
        ? DETAILS[category]
        : [];

  return (
    <Dialog open={word !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm space-y-3">
        <DialogHeader>
          <DialogTitle dir="rtl" lang="ar" className="ar-quran text-center">
            {word?.text}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-1.5">
          {CATEGORIES.map((c) => (
            <Button key={c.id} size="sm" variant={category === c.id ? "default" : "outline"}
              onClick={() => { setCategory(c.id); setDetail(null); }}>
              {c.label}
            </Button>
          ))}
        </div>
        {details.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {details.map((d) => (
              <button key={d.id} type="button"
                onClick={() => setDetail(detail === d.id ? null : d.id)}
                className={cn(
                  "rounded-md border border-line px-2 py-1 text-xs transition-colors",
                  category === "makhraj" && "ar-ui",
                  detail === d.id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}>
                {d.label}
              </button>
            ))}
          </div>
        )}
        <Input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)" className="h-8 text-sm" />
        <div className="flex items-center justify-between gap-2">
          {onRemove ? (
            <Button size="sm" variant="outline" onClick={onRemove}>Remove</Button>
          ) : <span />}
          <Button size="sm" disabled={!category}
            onClick={() => category && onSave({ category, detail, note })}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

If the base-ui Dialog doesn't render its content in jsdom without a portal container, mirror whatever `strike-manager`'s existing test setup does (check `src/components/app/` for a dialog test first; if none exists and the portal blocks assertions, render with `container: document.body` and query via `screen`).

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat(hifz): mistake sheet — two-level quick pick with makhraj letters"`

---

### Task 9: ReviewLogger + StartReviewButton

**Files:**
- Create: `web/src/components/app/review-logger.tsx`
- Create: `web/src/components/app/start-review-button.tsx`
- Test: `web/src/components/app/review-logger.test.tsx`

- [ ] **Step 1: Write the failing test** (actions mocked — the test drives tap → sheet → save → count):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { ReviewLogger } from "./review-logger";
import { groupIntoPages, type QuranWord } from "@/lib/quran/mushaf";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/hifz/review-actions", () => ({
  logMistake: vi.fn(async () => "new-id"),
  removeMistake: vi.fn(async () => {}),
  submitSession: vi.fn(async () => {}),
}));
import { logMistake, submitSession } from "@/lib/hifz/review-actions";

const w = (over: Partial<QuranWord>): QuranWord => ({
  surah: 114, ayah: 1, position: 1, text: "قُلْ", isEnd: false, page: 604, line: 12, ...over,
});
const pages = groupIntoPages([w({}), w({ position: 2, text: "أَعُوذُ" })]);

beforeEach(() => vi.clearAllMocks());

describe("ReviewLogger", () => {
  it("logs a tapped word through the sheet and bumps the count", async () => {
    render(<ReviewLogger sessionId="s1" reciterName="Bilal" pages={pages} initialMistakes={[]} />);
    expect(screen.getByText(/0 mistakes/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "قُلْ" }));
    fireEvent.click(screen.getByRole("button", { name: "Hifz" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(logMistake).toHaveBeenCalledWith(
      "s1", { surah: 114, ayah: 1, position: 1 }, "hifz", undefined, "");
    expect(await screen.findByText(/1 mistake/)).toBeTruthy();
  });
  it("submits flags and note from the wrap-up", async () => {
    render(<ReviewLogger sessionId="s1" reciterName="Bilal" pages={pages} initialMistakes={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.click(screen.getByLabelText("Weak hifz overall"));
    fireEvent.click(screen.getByRole("button", { name: /Submit/ }));
    expect(submitSession).toHaveBeenCalledWith("s1", ["weak_hifz"], "");
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `review-logger.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MushafReader } from "./mushaf-reader";
import { MistakeSheet, type SheetResult } from "./mistake-sheet";
import { logMistake, removeMistake, submitSession } from "@/lib/hifz/review-actions";
import { SESSION_FLAGS, type Category } from "@/lib/hifz/mistake-taxonomy";
import { wordKey, type MushafPage, type QuranWord } from "@/lib/quran/mushaf";
import type { MistakeRow } from "@/lib/hifz/mistakes";

type Mark = { id?: string; category: Category; detail: string | null; note: string | null };

/**
 * The live logging island: tap a word → classify → it tints. State is local
 * (each tap is one server action, no refresh); submit refreshes the page so
 * the server swaps this for the feedback view.
 */
export function ReviewLogger({
  sessionId,
  reciterName,
  pages,
  initialMistakes,
}: {
  sessionId: string;
  reciterName: string;
  pages: MushafPage[];
  initialMistakes: MistakeRow[];
}) {
  const router = useRouter();
  const [marks, setMarks] = useState<Record<string, Mark>>(() =>
    Object.fromEntries(
      initialMistakes.map((m) => [
        wordKey({ surah: m.surah_number, ayah: m.ayah_number, position: m.word_position }),
        { id: m.id, category: m.category, detail: m.detail, note: m.note },
      ]),
    ),
  );
  const [tapped, setTapped] = useState<QuranWord | null>(null);
  const [wrapUp, setWrapUp] = useState(false);
  const [flags, setFlags] = useState<string[]>([]);
  const [overallNote, setOverallNote] = useState("");
  const [pending, startTransition] = useTransition();

  const save = (r: SheetResult) => {
    const word = tapped;
    if (!word) return;
    setTapped(null);
    startTransition(async () => {
      const id = await logMistake(
        sessionId,
        { surah: word.surah, ayah: word.ayah, position: word.position },
        r.category,
        r.detail ?? undefined,
        r.note,
      );
      setMarks((m) => ({
        ...m,
        [wordKey(word)]: { id, category: r.category, detail: r.detail, note: r.note },
      }));
    });
  };

  const remove = () => {
    const word = tapped;
    if (!word) return;
    const mark = marks[wordKey(word)];
    setTapped(null);
    if (!mark?.id) return;
    startTransition(async () => {
      await removeMistake(mark.id!);
      setMarks((m) => {
        const next = { ...m };
        delete next[wordKey(word)];
        return next;
      });
    });
  };

  const submit = () =>
    startTransition(async () => {
      await submitSession(sessionId, flags, overallNote);
      setWrapUp(false);
      router.refresh();
    });

  const count = Object.keys(marks).length;
  const plural = count === 1 ? "mistake" : "mistakes";
  const existing = tapped ? marks[wordKey(tapped)] : undefined;

  return (
    <div className="space-y-3">
      <div className="glass sticky top-2 z-10 flex items-center justify-between rounded-xl px-4 py-2.5">
        <p className="text-sm">
          Listening to <span className="font-medium">{reciterName}</span>
          <span className="ml-2 text-xs tabular-nums text-muted-foreground">{count} {plural}</span>
        </p>
        <Button size="sm" disabled={pending} onClick={() => setWrapUp(true)}>Finish</Button>
      </div>

      <MushafReader pages={pages} marks={marks} onWordTap={setTapped} />

      <MistakeSheet
        key={tapped ? wordKey(tapped) : "closed"}
        word={tapped}
        existing={existing}
        onSave={save}
        onRemove={existing ? remove : undefined}
        onClose={() => setTapped(null)}
      />

      <Dialog open={wrapUp} onOpenChange={setWrapUp}>
        <DialogContent className="max-w-sm space-y-3">
          <DialogHeader><DialogTitle>Finish session</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            {SESSION_FLAGS.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={flags.includes(f.id)}
                  onChange={(e) =>
                    setFlags((cur) => e.target.checked ? [...cur, f.id] : cur.filter((x) => x !== f.id))
                  }
                />
                {f.label}
              </label>
            ))}
          </div>
          <Textarea value={overallNote} onChange={(e) => setOverallNote(e.target.value)}
            placeholder="Overall note for the session (optional)" rows={3} />
          <Button disabled={pending} onClick={submit}>
            {pending ? "Submitting…" : `Submit ${count} ${plural}`}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 4: Implement `start-review-button.tsx`**

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { startSession } from "@/lib/hifz/review-actions";

export function StartReviewButton({
  reciterId, partnerName, disabled,
}: { reciterId: string; partnerName: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          await startSession(reciterId);
          router.refresh();
        })
      }
    >
      {pending ? "Starting…" : `Start reviewing ${partnerName}`}
    </Button>
  );
}
```

- [ ] **Step 5: Run to verify pass** — `npx vitest run src/components/app/review-logger.test.tsx`.

- [ ] **Step 6: Commit** — `git commit -m "feat(hifz): live review logger — tap, classify, wrap up, submit"`

---

### Task 10: PatternTracker, HeatViewer, ReviewFeedback

**Files:**
- Create: `web/src/components/app/pattern-tracker.tsx`
- Test: `web/src/components/app/pattern-tracker.test.tsx`
- Create: `web/src/components/app/heat-viewer.tsx`
- Create: `web/src/components/app/review-feedback.tsx`

- [ ] **Step 1: Write the failing PatternTracker test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PatternTracker } from "./pattern-tracker";

describe("PatternTracker", () => {
  it("renders nothing when there is nothing to say", () => {
    const { container } = render(<PatternTracker patterns={[]} flags={[]} />);
    expect(container.innerHTML).toBe("");
  });
  it("shows patterns with counts and flags with session ratios", () => {
    const { container } = render(
      <PatternTracker
        patterns={[{ category: "tajweed", detail: "ikhfa", label: "Tajweed — Ikhfa",
          total: 7, recent: 4, surahs: [114, 113, 110], lastSeen: "2026-08-13T00:00:00Z" }]}
        flags={[{ flag: "weak_hifz", label: "Weak hifz overall", count: 3, ofLast: 5 }]}
      />,
    );
    expect(container.textContent).toContain("Tajweed — Ikhfa");
    expect(container.textContent).toContain("7× · 3 surahs");
    expect(container.textContent).toContain("4 recent");
    expect(container.textContent).toContain("Weak hifz overall");
    expect(container.textContent).toContain("3 of last 5 sessions");
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `pattern-tracker.tsx`** (server-renderable, no client hooks):

```tsx
import type { FlagPattern, Pattern } from "@/lib/hifz/mistakes";

/** The mistake tracker: recurring (category, detail) patterns plus
 *  session-level flags. Pure presentation — aggregation happens in lib. */
export function PatternTracker({ patterns, flags }: { patterns: Pattern[]; flags: FlagPattern[] }) {
  if (!patterns.length && !flags.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Recurring mistakes</h3>
      <ul className="divide-y divide-line overflow-hidden glass rounded-2xl">
        {patterns.map((p) => (
          <li key={`${p.category}|${p.detail}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0 truncate text-sm">{p.label}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
              {p.total}× · {p.surahs.length} surah{p.surahs.length === 1 ? "" : "s"}
              {p.recent > 0 && (
                <span className="rounded-md bg-warn/12 px-1.5 py-0.5 font-medium text-warn">
                  {p.recent} recent
                </span>
              )}
            </span>
          </li>
        ))}
        {flags.map((f) => (
          <li key={f.flag} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0 truncate text-sm">{f.label}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {f.count} of last {f.ofLast} session{f.ofLast === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Implement `heat-viewer.tsx`** (client — reader in heat mode + history dialog):

```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MushafReader } from "./mushaf-reader";
import { wordKey, type MushafPage, type QuranWord } from "@/lib/quran/mushaf";

export type WordHistoryEntry = { label: string; note: string | null; date: string };

/** Heat mode: tinted mushaf; tapping a hot word lists what went wrong there. */
export function HeatViewer({
  pages, heat, history,
}: {
  pages: MushafPage[];
  heat: Record<string, string>;                    // wordKey → tint class
  history: Record<string, WordHistoryEntry[]>;     // wordKey → entries, newest first
}) {
  const [open, setOpen] = useState<{ word: QuranWord; entries: WordHistoryEntry[] } | null>(null);
  const onTap = (word: QuranWord) => {
    const entries = history[wordKey(word)];
    if (entries?.length) setOpen({ word, entries });
  };
  return (
    <>
      <MushafReader pages={pages} heat={heat} onWordTap={onTap} />
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-sm space-y-2">
          <DialogHeader>
            <DialogTitle dir="rtl" lang="ar" className="ar-quran text-center">
              {open?.word.text}
            </DialogTitle>
          </DialogHeader>
          <ul className="space-y-1.5">
            {open?.entries.map((e, i) => (
              <li key={i} className="rounded-md bg-muted px-2.5 py-1.5 text-xs">
                <span className="font-medium">{e.label}</span>
                <span className="ml-2 text-muted-foreground">
                  {new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
                {e.note && <p className="mt-0.5 text-ink-2">{e.note}</p>}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 6: Implement `review-feedback.tsx`** (server component — the shared "what came out of reviews" view for the reciter AND the teacher):

```tsx
import Link from "next/link";
import { feedbackFor } from "@/lib/hifz/review-queries";
import {
  aggregateFlags, aggregatePatterns, heatClass, wordHeat,
} from "@/lib/hifz/mistakes";
import { detailLabel } from "@/lib/hifz/mistake-taxonomy";
import { getCachedSurahs, getCachedSurahWords } from "@/lib/reference/cached";
import { fromRow, groupIntoPages, wordKey } from "@/lib/quran/mushaf";
import { PatternTracker } from "./pattern-tracker";
import { HeatViewer, type WordHistoryEntry } from "./heat-viewer";
import { cn } from "@/lib/utils";

/**
 * Submitted-review results for one student: pattern tracker, per-surah
 * heatmap, session history. RLS behind feedbackFor decides who may look.
 * basePath already carries ?tab=review — heat links append &heat=N.
 */
export async function ReviewFeedback({
  studentId, heatSurah, basePath,
}: {
  studentId: string;
  heatSurah?: number;
  basePath: string;
}) {
  const [{ sessions, mistakes }, surahs] = await Promise.all([
    feedbackFor(studentId),
    getCachedSurahs(),
  ]);
  if (!sessions.length) {
    return (
      <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">
        No submitted reviews yet.
      </p>
    );
  }

  const now = new Date();
  const patterns = aggregatePatterns(mistakes, now);
  const flags = aggregateFlags(sessions);

  const counts = new Map<number, number>();
  for (const m of mistakes) counts.set(m.surah_number, (counts.get(m.surah_number) ?? 0) + 1);
  const heatSurahs = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const active = heatSurah && counts.has(heatSurah) ? heatSurah : heatSurahs[0];
  const nameOf = new Map(surahs.map((s) => [s.number, s.name_en]));

  let heatBlock: React.ReactNode = null;
  if (active) {
    const rows = await getCachedSurahWords(active);
    const pages = groupIntoPages(rows.map(fromRow));
    const inSurah = mistakes.filter((m) => m.surah_number === active);
    const heat = Object.fromEntries(
      Object.entries(wordHeat(inSurah, now)).map(([k, v]) => [k, heatClass(v)]),
    );
    const history: Record<string, WordHistoryEntry[]> = {};
    for (const m of [...inSurah].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      const k = wordKey({ surah: m.surah_number, ayah: m.ayah_number, position: m.word_position });
      (history[k] ??= []).push({
        label: detailLabel(m.category, m.detail), note: m.note, date: m.created_at,
      });
    }
    heatBlock = (
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Mistake heatmap</h3>
        <div className="flex flex-wrap gap-1.5">
          {heatSurahs.map((n) => (
            <Link key={n} href={`${basePath}&heat=${n}`}
              className={cn(
                "rounded-md border border-line px-2 py-1 text-xs transition-colors",
                n === active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}>
              {nameOf.get(n) ?? n} · {counts.get(n)}
            </Link>
          ))}
        </div>
        <HeatViewer pages={pages} heat={heat} history={history} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PatternTracker patterns={patterns} flags={flags} />
      {heatBlock}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Review sessions</h3>
        <ul className="divide-y divide-line overflow-hidden glass rounded-2xl">
          {sessions.map((s) => {
            const n = mistakes.filter((m) => m.session_id === s.id).length;
            return (
              <li key={s.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {new Date(s.submitted_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    <span className="ml-2 text-xs text-muted-foreground">by {s.reviewerName}</span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {n} mistake{n === 1 ? "" : "s"}
                  </span>
                </div>
                {s.overall_note && (
                  <p className="mt-1 rounded-md bg-muted px-2.5 py-1.5 text-xs text-ink-2">{s.overall_note}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Type-check** — `npx tsc --noEmit` → clean.

- [ ] **Step 8: Commit** — `git commit -m "feat(hifz): feedback view — pattern tracker, heatmap, session history"`

---

### Task 11: Student page — tabs + Review tab assembly

**Files:**
- Create: `web/src/components/app/hifz-tabs.tsx`
- Create: `web/src/components/app/review-tab.tsx`
- Modify: `web/src/app/(student)/hifz/page.tsx`

- [ ] **Step 1: Implement `hifz-tabs.tsx`** (shared by student and teacher pages):

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Overview | Review pill nav. basePath is the bare page URL. */
export function HifzTabs({ basePath, active }: { basePath: string; active: "overview" | "review" }) {
  const cls = (id: string) =>
    cn(
      "rounded-lg px-3 py-1.5 text-sm transition-colors",
      active === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <nav className="glass inline-flex rounded-xl p-1">
      <Link href={basePath} className={cls("overview")}>Overview</Link>
      <Link href={`${basePath}?tab=review`} className={cls("review")}>Review</Link>
    </nav>
  );
}
```

- [ ] **Step 2: Implement `review-tab.tsx`** (server assembly of the student Review tab):

```tsx
import Link from "next/link";
import {
  draftMistakes, myActivePair, myDraftSession, partnerRange,
} from "@/lib/hifz/review-queries";
import { getCachedSurahWords } from "@/lib/reference/cached";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import { ReviewLogger } from "./review-logger";
import { StartReviewButton } from "./start-review-button";
import { ReviewFeedback } from "./review-feedback";
import { cn } from "@/lib/utils";

/** The student Review tab: review-your-partner on top, your own feedback
 *  below. Everything hangs off the teacher-assigned active pair. */
export async function ReviewTab({
  userId, surahParam, heatParam,
}: {
  userId: string;
  surahParam?: string;
  heatParam?: string;
}) {
  const pair = await myActivePair(userId);
  const heatSurah = heatParam ? Number(heatParam) : undefined;

  if (!pair) {
    return (
      <div className="space-y-5">
        <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">
          Your teacher hasn't paired you with anyone yet — reviews happen with
          your revision partner.
        </p>
        <section className="space-y-2">
          <h2 className="text-lg">Your feedback</h2>
          <ReviewFeedback studentId={userId} heatSurah={heatSurah} basePath="/hifz?tab=review" />
        </section>
      </div>
    );
  }

  const [range, draft] = await Promise.all([
    partnerRange(pair.partnerId),
    myDraftSession(userId, pair.partnerId),
  ]);

  let logging: React.ReactNode;
  if (draft) {
    const requested = Number(surahParam);
    const surah =
      (range.some((s) => s.number === requested) ? requested : null) ??
      (range.find((s) => s.current) ?? range[0])?.number;
    if (!surah) {
      logging = (
        <p className="text-sm text-muted-foreground">
          {pair.partnerName} has no memorisation target yet — ask your teacher.
        </p>
      );
    } else {
      const [rows, mistakes] = await Promise.all([
        getCachedSurahWords(surah),
        draftMistakes(draft.id),
      ]);
      logging = (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {range.map((s) => (
              <Link key={s.number} href={`/hifz?tab=review&surah=${s.number}`}
                className={cn(
                  "rounded-md border border-line px-2 py-1 text-xs transition-colors",
                  s.number === surah ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}>
                {s.name_en}{s.current ? " · current" : ""}
              </Link>
            ))}
          </div>
          <ReviewLogger
            sessionId={draft.id}
            reciterName={pair.partnerName}
            pages={groupIntoPages(rows.map(fromRow))}
            initialMistakes={mistakes.filter((m) => m.surah_number === surah)}
          />
        </div>
      );
    }
  } else {
    logging = (
      <div className="space-y-2">
        <StartReviewButton
          reciterId={pair.partnerId}
          partnerName={pair.partnerName}
          disabled={range.length === 0}
        />
        {range.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {pair.partnerName} has no memorisation target yet.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="glass rounded-2xl p-4 space-y-3">
        <p className="text-sm">
          Revising with <span className="font-medium">{pair.partnerName}</span>
        </p>
        {logging}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg">Your feedback</h2>
        <ReviewFeedback studentId={userId} heatSurah={heatSurah} basePath="/hifz?tab=review" />
      </section>
    </div>
  );
}
```

Note the ReviewLogger's mistake count only shows this surah's marks (`initialMistakes` filtered) — the full session count returns at submit. Acceptable v1 simplification; the alternative (pass all mistakes, count globally, mark locally) can come later.

- [ ] **Step 3: Modify the student page** — RE-READ IT FIRST (concurrent sessions). The shape to reach: header + tabs always render; `tab=review` short-circuits to `<ReviewTab>`; otherwise the existing overview logic runs unchanged (its `EmptyState` cards render inside the shell so the Review tab stays reachable for students without targets). The diff, against the file as read on 2026-08-14:

```tsx
// imports to ADD:
import { HifzTabs } from "@/components/app/hifz-tabs";
import { ReviewTab } from "@/components/app/review-tab";

// signature becomes:
export default async function StudentHifz({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; surah?: string; heat?: string }>;
}) {
  const { tab, surah, heat } = await searchParams;
  const profile = (await currentProfile())!;

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl">Hifz</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your memorisation journey.</p>
      </header>
      <HifzTabs basePath="/hifz" active={tab === "review" ? "review" : "overview"} />
      {children}
    </div>
  );

  if (tab === "review") {
    return shell(<ReviewTab userId={profile.id} surahParam={surah} heatParam={heat} />);
  }
  // ... existing overview logic, with two mechanical changes:
  //  1. every `return <EmptyState message=... />` becomes `return shell(<EmptyState message=... />)`
  //     and EmptyState's own <h1>Hifz</h1> line is deleted (the shell owns the heading now).
  //  2. the final return's wrapper div + header are replaced by `return shell(<> ...existing
  //     HifzHero/HifzJourney/HifzRecord... </>)`.
}
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean, `npx vitest run` all green, then `npm run dev` and eyeball `/hifz` (overview unchanged) and `/hifz?tab=review` (pair states) as a seeded demo student (`seed_demo.ts` accounts, password `BsmsDemo2026!`).

- [ ] **Step 5: Commit** — `git commit -m "feat(hifz): student review tab — partner logging and feedback"`

---

### Task 12: Teacher pages — pairing panel + detail tabs

**Files:**
- Create: `web/src/components/app/pairing-panel.tsx`
- Modify: `web/src/app/teacher/hifz/page.tsx`
- Modify: `web/src/app/teacher/hifz/[studentId]/page.tsx`

- [ ] **Step 1: Implement `pairing-panel.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { assignPair, unassignPair } from "@/lib/hifz/review-actions";

export type PairRow = { id: string; label: string };
export type UnpairedStudent = { id: string; name: string };

/** Teacher-side revision pairs: current pairs with unpair, plus two selects
 *  over the unpaired students to form a new one. */
export function PairingPanel({ pairs, unpaired }: { pairs: PairRow[]; unpaired: UnpairedStudent[] }) {
  const router = useRouter();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [pending, startTransition] = useTransition();
  const selectCls = "h-8 rounded-md border border-line bg-transparent px-2 text-sm";

  return (
    <section className="glass rounded-2xl p-4 space-y-3">
      <h2 className="text-sm font-medium">Revision pairs</h2>
      {pairs.length > 0 && (
        <ul className="space-y-1.5">
          {pairs.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
              <span>{p.label}</span>
              <Button size="sm" variant="outline" disabled={pending}
                onClick={() => startTransition(async () => { await unassignPair(p.id); router.refresh(); })}>
                Unpair
              </Button>
            </li>
          ))}
        </ul>
      )}
      {unpaired.length >= 2 && (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="First student" value={a} onChange={(e) => setA(e.target.value)} className={selectCls}>
            <option value="">First student…</option>
            {unpaired.filter((s) => s.id !== b).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select aria-label="Second student" value={b} onChange={(e) => setB(e.target.value)} className={selectCls}>
            <option value="">Second student…</option>
            {unpaired.filter((s) => s.id !== a).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button size="sm" disabled={!a || !b || pending}
            onClick={() => startTransition(async () => { await assignPair(a, b); setA(""); setB(""); router.refresh(); })}>
            {pending ? "Pairing…" : "Pair"}
          </Button>
        </div>
      )}
      {unpaired.length === 1 && (
        <p className="text-xs text-muted-foreground">{unpaired[0].name} is unpaired.</p>
      )}
      {pairs.length === 0 && unpaired.length === 0 && (
        <p className="text-xs text-muted-foreground">No active students.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Modify the register page** (`/teacher/hifz`) — RE-READ FIRST. Add to the existing `Promise.all` data gathering (after `students`/`ids` exist):

```ts
import { PairingPanel, type PairRow, type UnpairedStudent } from "@/components/app/pairing-panel";

// after `ids` is built, alongside the existing progress/surahs reads:
const { data: pairRows } = ids.length
  ? await db.from("revision_pairs").select("id, student_a, student_b").eq("active", true)
      .or(`student_a.in.(${ids.join(",")}),student_b.in.(${ids.join(",")})`)
  : { data: [] as { id: string; student_a: string; student_b: string }[] };

const nameOf = new Map(students.map((s) => [s.id, s.full_name]));
const pairs: PairRow[] = (pairRows ?? []).map((p) => ({
  id: p.id,
  label: `${nameOf.get(p.student_a) ?? "?"} ↔ ${nameOf.get(p.student_b) ?? "?"}`,
}));
const pairedIds = new Set((pairRows ?? []).flatMap((p) => [p.student_a, p.student_b]));
const unpaired: UnpairedStudent[] = students
  .filter((s) => !pairedIds.has(s.id))
  .map((s) => ({ id: s.id, name: s.full_name }));
```

Render `<PairingPanel pairs={pairs} unpaired={unpaired} />` between the `<header>` and the register list.

- [ ] **Step 3: Modify the detail page** (`/teacher/hifz/[studentId]`) — RE-READ FIRST. Same shell pattern as the student page:

```tsx
// imports to ADD:
import { HifzTabs } from "@/components/app/hifz-tabs";
import { ReviewFeedback } from "@/components/app/review-feedback";

// signature gains searchParams:
export default async function StudentHifzDetail({
  params, searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ tab?: string; heat?: string }>;
}) {
  const [{ studentId }, { tab, heat }] = await Promise.all([params, searchParams]);
  // ...existing fetches and guards unchanged...

  // in the returned JSX, directly under the <header>:
  <HifzTabs basePath={`/teacher/hifz/${studentId}`} active={tab === "review" ? "review" : "overview"} />

  // then: tab === "review"
  //   ? <ReviewFeedback studentId={studentId} heatSurah={heat ? Number(heat) : undefined}
  //       basePath={`/teacher/hifz/${studentId}?tab=review`} />
  //   : (the existing PaceMarker + HifzMarker blocks, unchanged)
}
```

Keep the existing data fetches unconditional (the guard comment in that file explains why they all fire together); only the rendering forks on the tab.

- [ ] **Step 4: Verify** — `npx tsc --noEmit`, `npx vitest run`, then in the dev server as a seeded demo teacher: pair two students on `/teacher/hifz`, and check `/teacher/hifz/<id>?tab=review` renders the feedback view.

- [ ] **Step 5: Commit** — `git commit -m "feat(hifz): teacher pairing panel and per-student review tab"`

---

### Task 13: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — `cd web && npm test` → all green.
- [ ] **Step 2: Types + lint + build** — `npx tsc --noEmit && npm run lint && npm run build` → clean. (Build matters: `next build` catches server/client component boundary mistakes tests don't.)
- [ ] **Step 3: Manual walkthrough** with two demo students (seeded pair) in two browser sessions:
  1. Teacher pairs Adam + Bilal on `/teacher/hifz` → both students' Review tabs show the partner.
  2. Adam starts reviewing Bilal → mushaf renders with printed line breaks (`.ar-quran` font, RTL, justified) → tap a word → Tajweed → Ikhfa → save → word tints → tap again → Remove works.
  3. Switch surah chips mid-session → marks for the other surah persist (re-entering shows them).
  4. Finish → flag "Weak hifz overall" + note → Submit.
  5. Bilal's Review tab now shows the session, pattern tracker, heatmap; Adam's does NOT (he sees only his own feedback); teacher's detail page shows it read-only.
  6. Draft invisibility: while a new draft is open with mistakes, Bilal sees nothing new.
- [ ] **Step 4: Update `HIFZ.md`** — add a line under "How it works today" noting the peer-review layer exists and where its spec lives (do not touch the rework backlog items).
- [ ] **Step 5: Commit** — `git add HIFZ.md && git commit -m "docs(hifz): note the peer-review layer in the working file"`
- [ ] **Step 6: Do NOT push.** A push to `main` deploys to production (CLAUDE.md). Report completion and ask the user before pushing.

---

## Self-review (done at write time)

- **Spec coverage:** seeded text (T1–T2), mushaf rendering (T3, T7), taxonomy + flags (T4), tracker + heat (T5, T10), pairs (T1, T12), sessions/logging (T6, T9), student tabs (T11), teacher visibility (T12), verification incl. RLS behaviours (T13). Deviations (font, seed mechanics, seed scope 72–114) are declared in the header.
- **Type consistency:** `QuranWord`/`MushafPage`/`wordKey`/`fromRow` (T3) used by T7/T9/T10/T11; `MistakeRow`/`SessionRow` (T5) used by T6/T9/T10; `SheetResult` (T8) consumed in T9; `logMistake` returns `Promise<string>` (T6) and T9 uses the id; `PairRow`/`UnpairedStudent` (T12) match the register mapping.
- **Placeholders:** none — every code step carries the code; page edits that depend on live file state say exactly what changes and warn to re-read first.
