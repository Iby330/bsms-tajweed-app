# Teacher Hearings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teacher opens one surah from a student's hifdh page, taps the mistakes on the mushaf while the student recites, and ends with Passed or Not passed; the student then sees that surah with the teacher's marks on it.

**Architecture:** A hearing is a `revision_sessions` row of `kind = 'hearing'` with a teacher as reviewer and one `surah_number`, reusing the peer logger's tap-to-classify and mistake rows unchanged. Two new pages render the mushaf scoped to a surah: the teacher's is the logger with a verdict bar, the student's is read-only heat. The old marking panel on the teacher's grid is deleted; grid cells become links.

**Tech Stack:** Next.js 15 App Router (server components + server actions), Supabase (Postgres, RLS, supabase-js), Tailwind v4, vitest + @testing-library/react. Spec: `docs/superpowers/specs/2026-09-15-teacher-hearing-design.md`.

---

## Conventions you must know

- All app code is under `web/`. Run every `npm`/`npx` command from `web/` unless a step says otherwise.
- Tests: `npx vitest run <path>` for one file, `npm test` for the suite. Live tests (`*.live.test.ts`) are excluded from `npm test`.
- Typecheck: `npx tsc --noEmit -p .` Lint: `npm run lint`.
- Server actions live in files starting `"use server"`. Query helpers that must never reach the client start with `import "server-only"`.
- Row-level security (RLS) is the real authorisation. Server actions add `requireTeacher()` / `requireOwnStudent()` as a courtesy check in front of it.
- Commit only the paths you touched (`git add <paths>`, never `git add -A`). Other sessions leave unrelated changes in the tree. Commit messages read like the log: `feat(hifz): the surah page is the logger`. End every commit message with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```
- The mushaf helpers: `wordKey` (`"114:1:3"`), `ayahKey` (`"114:1"`), `markKey` (ayah key when `position` is null, else word key). `MistakeRow.word_position === null` means the whole ayah.
- The database is applied to with `npx tsx execution/apply_migration.ts <file>` from the repo root (see the header of `execution/apply_migration.ts`); there is no Supabase CLI here. Types are regenerated through the Management API (Task 2 shows how).

## File map

| File | Responsibility |
| --- | --- |
| `web/src/lib/teacher/guards.ts` (new) | `requireTeacher`, `requireOwnStudent` shared by every teacher action |
| `web/supabase/migrations/0029_teacher_hearings.sql` (new) | columns, constraints, RLS for hearings |
| `web/src/lib/database.types.ts` | regenerated |
| `web/src/lib/hifz/heat-spread.ts` (new) | mistakes → per-word tint + tap history (extracted from `review-feedback.tsx`) |
| `web/src/lib/quran/page-within.ts` (new) | clamp a requested page into a surah's page range |
| `web/src/lib/reference/cached.ts` | `getCachedSurahPageRange` |
| `web/src/components/app/mushaf-pager.tsx` | works with a basePath that has no query string yet |
| `web/src/lib/hifz/hearings.ts` (new) | pure: `recordLine` and the hearing/record summary types |
| `web/src/lib/hifz/hearing-queries.ts` (new) | `hearingsFor`, `draftHearing` |
| `web/src/lib/hifz/hearing-actions.ts` (new) | `startHearing`, `submitHearing` |
| `web/src/components/app/surah-mushaf.tsx` (new) | read-only scoped mushaf with heat (student page) |
| `web/src/app/(student)/hifz/[surah]/page.tsx` | gains the mushaf and the record line |
| `web/src/components/app/mistake-sheet.tsx` | shows earlier marks on the tapped word |
| `web/src/components/app/review-logger.tsx` | `mode="hearing"`: lazy draft, heat underlay, verdict bar |
| `web/src/app/teacher/hifz/[studentId]/[surah]/page.tsx` (new) | the teacher's surah page |
| `web/src/components/app/record-actions.tsx` (new) | Save comment / Undo pass on a passed surah |
| `web/src/components/app/hifz-grid.tsx` | cells become links; the panel goes |
| `web/supabase/checks/hearings_rls.sql` (new) | live RLS check, run through `--probe` |

---

### Task 1: Share the teacher guards

The three actions in `actions.ts` and the pair actions in `review-actions.ts` each carry their own copy of `requireTeacher`. The hearing actions need both guards, so move them to one module first.

**Files:**
- Create: `web/src/lib/teacher/guards.ts`
- Modify: `web/src/lib/hifz/actions.ts:1-27`
- Modify: `web/src/lib/hifz/review-actions.ts:1-12`

- [ ] **Step 1: Create the guards module**

```ts
// web/src/lib/teacher/guards.ts
import "server-only";
import { currentProfile } from "@/lib/supabase/server";
import { teacherRoster } from "./scope";

/** The caller is a signed-in teacher. Throws otherwise. */
export async function requireTeacher() {
  const profile = await currentProfile();
  if (!profile || profile.role !== "teacher") throw new Error("Teachers only.");
  return profile;
}

/**
 * …and this student is one of theirs. The pages are scoped so the buttons
 * are hidden; this is what stops the action itself, which a hidden button
 * does not. RLS still grants teachers the whole cohort — this is blast
 * radius, not a security boundary.
 */
export async function requireOwnStudent(studentId: string): Promise<void> {
  const roster = await teacherRoster();
  if (!roster.some((s) => s.id === studentId)) throw new Error("Not your student.");
}
```

- [ ] **Step 2: Use it from `actions.ts`**

Delete the local `requireTeacher` and `requireOwnStudent` functions (lines 10–27 of `web/src/lib/hifz/actions.ts`, including their doc comments) and add the import:

```ts
import { requireOwnStudent, requireTeacher } from "@/lib/teacher/guards";
```

If `npm run lint` then reports `currentProfile` or `teacherRoster` as unused in that file, remove them from their import lines.

- [ ] **Step 3: Use it from `review-actions.ts`**

Delete the local `requireTeacher` (lines 8–12). Keep `requireUser` — it is a different guard. Add:

```ts
import { requireTeacher } from "@/lib/teacher/guards";
```

If lint reports `teacherRoster` unused there, remove it from its import line (it is still used by `assignPair` — check before deleting).

- [ ] **Step 4: Typecheck, lint, run the suite**

Run: `npx tsc --noEmit -p . && npm run lint && npm test`
Expected: no type errors, no lint errors, all tests pass (the grid and logger tests mock these modules and are unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/lib/teacher/guards.ts src/lib/hifz/actions.ts src/lib/hifz/review-actions.ts
git commit -m "refactor(hifz): one copy of the teacher guards

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Migration — hearings in the schema

**Files:**
- Create: `web/supabase/migrations/0029_teacher_hearings.sql`
- Modify: `web/src/lib/database.types.ts` (regenerated)

- [ ] **Step 1: Write the migration**

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- Teacher hearings: a revision session of kind 'hearing', tied to one
-- surah, with a verdict. Spec: docs/superpowers/specs/2026-09-15-teacher-hearing-design.md
-- Every statement idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- A hearing IS a session: same mistakes, same logger. `kind` tells the two
-- apart; existing rows default to 'peer' and satisfy every check below.
alter table revision_sessions add column if not exists kind         text not null default 'peer';
alter table revision_sessions add column if not exists surah_number int references surahs(number);
alter table revision_sessions add column if not exists outcome      text;

alter table revision_sessions drop constraint if exists revision_sessions_kind_check;
alter table revision_sessions add constraint revision_sessions_kind_check
  check (kind in ('peer', 'hearing'));

alter table revision_sessions drop constraint if exists revision_sessions_outcome_check;
alter table revision_sessions add constraint revision_sessions_outcome_check
  check (outcome is null or outcome in ('passed', 'not_passed'));

-- A hearing names its surah; a peer session never does.
alter table revision_sessions drop constraint if exists revision_sessions_hearing_surah_check;
alter table revision_sessions add constraint revision_sessions_hearing_surah_check
  check ((kind = 'hearing') = (surah_number is not null));

-- Only a hearing carries a verdict.
alter table revision_sessions drop constraint if exists revision_sessions_peer_no_outcome_check;
alter table revision_sessions add constraint revision_sessions_peer_no_outcome_check
  check (kind = 'hearing' or outcome is null);

create index if not exists idx_revision_sessions_hearing
  on revision_sessions (reciter_id, surah_number) where kind = 'hearing';

-- The pass points at the hearing that produced it. Null for passes made
-- before this migration, or made from the register without a hearing.
alter table hifz_records add column if not exists session_id uuid references revision_sessions(id) on delete set null;

-- ── RLS ────────────────────────────────────────────────────────────────
-- Teachers already read every session and mistake (t_sessions_read,
-- t_mistakes_read). The reviewer policies on update / mistake insert /
-- mistake delete key on reviewer_id = auth.uid() with no role check, so
-- they admit a teacher reviewer as they stand. What a teacher lacks is the
-- INSERT on sessions, which students get only through an active pair.
drop policy if exists t_sessions_insert on revision_sessions;
create policy t_sessions_insert on revision_sessions for insert
  with check (is_teacher() and reviewer_id = auth.uid() and kind = 'hearing');

-- A student can never create a hearing: the peer insert now says so.
drop policy if exists s_sessions_insert on revision_sessions;
create policy s_sessions_insert on revision_sessions for insert
  with check (
    reviewer_id = auth.uid()
    and kind = 'peer'
    and exists (
      select 1 from revision_pairs p
      where p.active
        and ((p.student_a = reviewer_id and p.student_b = reciter_id)
          or (p.student_b = reviewer_id and p.student_a = reciter_id))
    )
  );
```

- [ ] **Step 2: Apply it**

From the repo root:

```bash
npx tsx execution/apply_migration.ts web/supabase/migrations/0029_teacher_hearings.sql
npx tsx execution/apply_migration.ts --check | tail -3
```

Expected: the first prints a success line (HTTP 201) and the second lists `0029_teacher_hearings.sql` as applied. Then confirm the columns exist rather than trusting the ledger:

```bash
npx tsx execution/apply_migration.ts --probe "select column_name from information_schema.columns where table_name = 'revision_sessions' and column_name in ('kind','surah_number','outcome')"
```

Expected: three rows.

- [ ] **Step 3: Regenerate the database types**

From `web/`, using the same `SUPABASE_ACCESS_TOKEN` and project ref that `execution/apply_migration.ts` reads (see its header for where they live):

```bash
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/types/typescript" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).types))' \
  > src/lib/database.types.ts
grep -n "surah_number: number | null" src/lib/database.types.ts | head -3
```

Expected: at least one match inside the `revision_sessions` block. Run `npx tsc --noEmit -p .` — it must still pass (nothing reads the new columns yet).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0029_teacher_hearings.sql src/lib/database.types.ts
git commit -m "feat(hifz): a session can be a hearing — kind, surah, verdict

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Extract the heat spread

`review-feedback.tsx` turns mistakes into a per-word tint and a tap history inline. Both new surah pages need the same thing, so it becomes a tested function.

**Files:**
- Create: `web/src/lib/hifz/heat-spread.ts`
- Create: `web/src/lib/hifz/heat-spread.test.ts`
- Modify: `web/src/components/app/heat-viewer.tsx:1-8`
- Modify: `web/src/components/app/review-feedback.tsx:75-104`

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/hifz/heat-spread.test.ts
import { describe, it, expect } from "vitest";
import { spreadHeat } from "./heat-spread";
import type { QuranWord } from "@/lib/quran/mushaf";
import type { MistakeRow } from "./mistakes";

const w = (position: number, isEnd = false): QuranWord => ({
  surah: 114, ayah: 1, position, text: "x", glyph: null, isEnd, page: 604, line: 1,
});
const m = (over: Partial<MistakeRow>): MistakeRow => ({
  id: "m", session_id: "s", surah_number: 114, ayah_number: 1, word_position: 1,
  category: "hifz", detail: "forgot", note: null, created_at: "2026-09-10T00:00:00Z", ...over,
});
const now = new Date("2026-09-15T00:00:00Z");

describe("spreadHeat", () => {
  it("tints a mis-read word and gives it a history", () => {
    const { heat, history } = spreadHeat([w(1), w(2)], [m({})], now);
    expect(heat["114:1:1"]).toBe("bg-warn/20");
    expect(heat["114:1:2"]).toBeUndefined();
    expect(history["114:1:1"]).toEqual([
      { label: "Hifdh — Forgot it", note: null, date: "2026-09-10T00:00:00Z" },
    ]);
    expect(history["114:1:2"]).toBeUndefined();
  });

  it("spreads an ayah-scoped mistake over every word of the ayah, marker included", () => {
    const { heat, history } = spreadHeat([w(1), w(2, true)], [m({ word_position: null })], now);
    expect(heat["114:1:1"]).toBe("bg-warn/20");
    expect(heat["114:1:2"]).toBe("bg-warn/20");
    expect(history["114:1:2"][0].label).toBe("Hifdh — Forgot it · whole ayah");
  });

  it("adds a word's own mistake to its ayah's, so both together read hotter", () => {
    const { heat } = spreadHeat([w(1)], [m({}), m({ id: "b", word_position: null })], now);
    expect(heat["114:1:1"]).toBe("bg-warn/40");
  });

  it("orders a word's history newest first", () => {
    const { history } = spreadHeat(
      [w(1)],
      [m({ id: "old", created_at: "2026-08-01T00:00:00Z" }), m({ id: "new", created_at: "2026-09-10T00:00:00Z" })],
      now,
    );
    expect(history["114:1:1"].map((e) => e.date)).toEqual(["2026-09-10T00:00:00Z", "2026-08-01T00:00:00Z"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/hifz/heat-spread.test.ts`
Expected: FAIL — cannot resolve `./heat-spread`.

- [ ] **Step 3: Write the module**

```ts
// web/src/lib/hifz/heat-spread.ts
import { ayahKey, markKey, wordKey, type QuranWord } from "@/lib/quran/mushaf";
import { detailLabel } from "./mistake-taxonomy";
import { heatClass, wordHeat, type MistakeRow } from "./mistakes";

export type WordHistoryEntry = { label: string; note: string | null; date: string };

export type HeatSpread = {
  heat: Record<string, string>;                 // wordKey → tint class
  history: Record<string, WordHistoryEntry[]>;  // wordKey → entries, newest first
};

/**
 * Mistakes → what the mushaf paints and what a tap on a word explains.
 *
 * wordHeat keys by markKey, so an ayah-scoped mistake lands on the ayah.
 * Spread it back over the words of the page and ADD the two: a word
 * mis-read inside an ayah that was also forgotten is hotter than either on
 * its own, which a `??` fallback in the reader would quietly hide. The
 * history gets the same spread, so tapping any word of a forgotten ayah —
 * including the end marker — explains why it is hot.
 */
export function spreadHeat(words: QuranWord[], mistakes: MistakeRow[], now: Date): HeatSpread {
  const raw = wordHeat(mistakes, now);
  const heat: Record<string, string> = {};
  for (const w of words) {
    const total = (raw[wordKey(w)] ?? 0) + (raw[ayahKey(w)] ?? 0);
    if (total > 0) heat[wordKey(w)] = heatClass(total);
  }

  const byTarget: Record<string, WordHistoryEntry[]> = {};
  for (const m of mistakes) {
    const k = markKey({ surah: m.surah_number, ayah: m.ayah_number, position: m.word_position });
    (byTarget[k] ??= []).push({
      label: detailLabel(m.category, m.detail) + (m.word_position === null ? " · whole ayah" : ""),
      note: m.note,
      date: m.created_at,
    });
  }
  const history: Record<string, WordHistoryEntry[]> = {};
  for (const w of words) {
    const entries = [...(byTarget[wordKey(w)] ?? []), ...(byTarget[ayahKey(w)] ?? [])];
    if (entries.length) history[wordKey(w)] = entries.sort((a, b) => b.date.localeCompare(a.date));
  }
  return { heat, history };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/hifz/heat-spread.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Point `heat-viewer.tsx` at the shared type**

Replace line 8 of `web/src/components/app/heat-viewer.tsx`:

```ts
export type WordHistoryEntry = { label: string; note: string | null; date: string };
```

with:

```ts
import type { WordHistoryEntry } from "@/lib/hifz/heat-spread";
export type { WordHistoryEntry };
```

- [ ] **Step 6: Use it from `review-feedback.tsx`**

In `web/src/components/app/review-feedback.tsx`, replace everything from the comment `// wordHeat keys by markKey…` down to the closing `}` of the `for (const w of words)` loop that builds `history` (the block that defines `raw`, `heatValues`, `byTarget`, `history`) with:

```ts
    const { heat: heatValues, history } = spreadHeat(words, mistakes, now);
```

Add the import and drop the ones no longer used:

```ts
import { spreadHeat } from "@/lib/hifz/heat-spread";
```

`aggregateFlags, aggregatePatterns` stay imported from `./mistakes`; `heatClass, wordHeat` go. `detailLabel` from `./mistake-taxonomy` goes. From `@/lib/quran/mushaf` keep `fromRow, groupIntoPages` only. `HeatViewer` stays; its `WordHistoryEntry` import goes.

- [ ] **Step 7: Typecheck, lint, suite**

Run: `npx tsc --noEmit -p . && npm run lint && npm test`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/hifz/heat-spread.ts src/lib/hifz/heat-spread.test.ts src/components/app/heat-viewer.tsx src/components/app/review-feedback.tsx
git commit -m "refactor(hifz): the heat spread is one tested function

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: A surah's pages, and a page within them

**Files:**
- Create: `web/src/lib/quran/page-within.ts`
- Create: `web/src/lib/quran/page-within.test.ts`
- Modify: `web/src/lib/reference/cached.ts` (append after `getCachedSurahStartPages`)
- Modify: `web/src/components/app/mushaf-pager.tsx:31-33`

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/quran/page-within.test.ts
import { describe, it, expect } from "vitest";
import { pageWithin } from "./page-within";

const range = { from: 591, to: 593 };

describe("pageWithin", () => {
  it("opens on the first page when nothing was asked for", () => {
    expect(pageWithin(undefined, range)).toBe(591);
    expect(pageWithin("", range)).toBe(591);
    expect(pageWithin("abc", range)).toBe(591);
  });
  it("keeps a page inside the range", () => {
    expect(pageWithin("592", range)).toBe(592);
  });
  it("clamps a page outside it", () => {
    expect(pageWithin("580", range)).toBe(591);
    expect(pageWithin("604", range)).toBe(593);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/quran/page-within.test.ts`
Expected: FAIL — cannot resolve `./page-within`.

- [ ] **Step 3: Write the helper**

```ts
// web/src/lib/quran/page-within.ts
export type PageRange = { from: number; to: number };

/** The page to show inside a surah: the one asked for, clamped to the
 *  surah's pages; the first page when nothing sensible was asked for. */
export function pageWithin(requested: string | undefined, range: PageRange): number {
  const n = Number(requested);
  if (requested === undefined || requested === "" || !Number.isInteger(n)) return range.from;
  return Math.min(Math.max(n, range.from), range.to);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/quran/page-within.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Add the cached range lookup**

Append to `web/src/lib/reference/cached.ts`, after `getCachedSurahStartPages`:

```ts
/**
 * The printed pages one surah occupies: its first word's page to its last
 * word's. Read from the words themselves rather than derived from the next
 * surah's start page, because a surah that ends at the foot of a page and
 * one that shares its last page with the next both need the right answer.
 * Null for a surah outside the seeded range.
 */
export const getCachedSurahPageRange = unstable_cache(
  async (surah: number): Promise<{ from: number; to: number } | null> => {
    const admin = supabaseAdmin();
    const [first, last] = await Promise.all([
      admin.from("quran_words").select("page_number").eq("surah_number", surah)
        .order("page_number", { ascending: true }).limit(1).maybeSingle(),
      admin.from("quran_words").select("page_number").eq("surah_number", surah)
        .order("page_number", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (first.error) throw first.error;
    if (last.error) throw last.error;
    if (!first.data || !last.data) return null;
    return { from: first.data.page_number, to: last.data.page_number };
  },
  ["ref-surah-page-range-v1"],
  { tags: ["reference"], revalidate: 3600 },
);
```

- [ ] **Step 6: Let the pager start a query string**

The pager builds `${basePath}&${param}=${p}` and so assumes `basePath` already carries `?tab=…`. The surah pages have no query. In `web/src/components/app/mushaf-pager.tsx` replace:

```ts
  const href = (p: number) => `${basePath}&${param}=${p}`;
```

with:

```ts
  // basePath may already carry a query (`/hifz?tab=review`) or be bare
  // (`/hifz/88`); start the string or extend it accordingly.
  const href = (p: number) => `${basePath}${basePath.includes("?") ? "&" : "?"}${param}=${p}`;
```

and change the comment on the `basePath` prop from `// already carries its ?tab=… query` to `// with or without a query string`.

- [ ] **Step 7: Typecheck and run the suite**

Run: `npx tsc --noEmit -p . && npm test`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/quran/page-within.ts src/lib/quran/page-within.test.ts src/lib/reference/cached.ts src/components/app/mushaf-pager.tsx
git commit -m "feat(hifz): the pages one surah occupies, and a page within them

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The record line

One sentence that says where a surah stands, used by both surah pages.

**Files:**
- Create: `web/src/lib/hifz/hearings.ts`
- Create: `web/src/lib/hifz/hearings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/hifz/hearings.test.ts
import { describe, it, expect } from "vitest";
import { fmtDay } from "@/lib/format";
import { recordLine, type HearingSummary } from "./hearings";

const when = "2026-09-10T10:00:00Z";
const day = fmtDay(when);
const heard = (over: Partial<HearingSummary> = {}): HearingSummary => ({
  submittedAt: when, outcome: "passed", teacherName: "Ustadh Bilal", mistakeCount: 3, ...over,
});
const record = { passedAt: when, comment: null };

describe("recordLine", () => {
  it("reads passed when the record exists", () => {
    expect(recordLine(record, heard())).toBe(`Heard by Ustadh Bilal on ${day} · passed · 3 mistakes`);
  });
  it("reads not passed from the verdict when there is no record", () => {
    expect(recordLine(null, heard({ outcome: "not_passed" }))).toBe(
      `Heard by Ustadh Bilal on ${day} · not passed · 3 mistakes`,
    );
  });
  it("reads not signed off when a pass was undone", () => {
    expect(recordLine(null, heard({ outcome: "passed" }))).toBe(
      `Heard by Ustadh Bilal on ${day} · not signed off · 3 mistakes`,
    );
  });
  it("counts one mistake in the singular", () => {
    expect(recordLine(record, heard({ mistakeCount: 1 }))).toContain("· 1 mistake");
    expect(recordLine(record, heard({ mistakeCount: 0 }))).toContain("· 0 mistakes");
  });
  it("describes a pass made before hearings existed", () => {
    expect(recordLine(record, null)).toBe(`Passed · heard on ${day}`);
  });
  it("says so when nothing has happened", () => {
    expect(recordLine(null, null)).toBe("Not heard yet");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/hifz/hearings.test.ts`
Expected: FAIL — cannot resolve `./hearings`.

- [ ] **Step 3: Write the module**

```ts
// web/src/lib/hifz/hearings.ts
import { fmtDay } from "@/lib/format";

export type HearingOutcome = "passed" | "not_passed";

/** The latest submitted hearing of a surah, reduced to what the line needs. */
export type HearingSummary = {
  submittedAt: string;
  outcome: HearingOutcome | null;
  teacherName: string;
  mistakeCount: number;
};

/** The pass record, if the surah has one. */
export type RecordSummary = { passedAt: string; comment: string | null };

/**
 * The one line under a surah's name that says where it stands.
 *
 * The record is the truth about "passed": a re-hearing that ends Not passed
 * does not take a pass away, and Undo pass takes it away without touching
 * the hearing. So status comes from the record when there is one, and from
 * the verdict only when there is not — and a passed verdict with no record
 * behind it reads as "not signed off", which is exactly what an undone pass
 * is.
 */
export function recordLine(record: RecordSummary | null, hearing: HearingSummary | null): string {
  if (!hearing) return record ? `Passed · heard on ${fmtDay(record.passedAt)}` : "Not heard yet";
  const n = hearing.mistakeCount;
  const mistakes = `${n} mistake${n === 1 ? "" : "s"}`;
  const status = record
    ? "passed"
    : hearing.outcome === "not_passed"
      ? "not passed"
      : "not signed off";
  return `Heard by ${hearing.teacherName} on ${fmtDay(hearing.submittedAt)} · ${status} · ${mistakes}`;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/hifz/hearings.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hifz/hearings.ts src/lib/hifz/hearings.test.ts
git commit -m "feat(hifz): the record line — where a surah stands, in one sentence

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Hearing queries

**Files:**
- Create: `web/src/lib/hifz/hearing-queries.ts`

- [ ] **Step 1: Write the module**

```ts
// web/src/lib/hifz/hearing-queries.ts
import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { MistakeRow } from "./mistakes";
import type { HearingOutcome } from "./hearings";

export type Hearing = {
  id: string;
  submittedAt: string;
  outcome: HearingOutcome | null;
  note: string | null;
  teacherName: string;
  mistakes: MistakeRow[];
};

const MISTAKE_COLS =
  "id, session_id, surah_number, ayah_number, word_position, category, detail, note, created_at";

/**
 * Submitted hearings of one surah for one student, newest first. Reads run
 * as the CALLER, so RLS decides what comes back: a student sees only
 * submitted rows, a teacher sees the cohort. The teacher's name goes through
 * the admin client because profiles are not cross-readable.
 */
export async function hearingsFor(studentId: string, surah: number): Promise<Hearing[]> {
  const db = await supabaseServer();
  const { data: sessions } = await db
    .from("revision_sessions")
    .select("id, reviewer_id, submitted_at, outcome, overall_note")
    .eq("reciter_id", studentId)
    .eq("kind", "hearing")
    .eq("surah_number", surah)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false });
  if (!sessions?.length) return [];

  const ids = sessions.map((s) => s.id);
  const [{ data: mistakes }, { data: names }] = await Promise.all([
    db.from("revision_mistakes").select(MISTAKE_COLS).in("session_id", ids),
    supabaseAdmin()
      .from("profiles")
      .select("id, full_name")
      .in("id", [...new Set(sessions.map((s) => s.reviewer_id))]),
  ]);
  const nameOf = new Map((names ?? []).map((p) => [p.id, p.full_name]));
  const rows = (mistakes ?? []) as MistakeRow[];
  return sessions.map((s) => ({
    id: s.id,
    submittedAt: s.submitted_at!,
    outcome: (s.outcome as HearingOutcome | null) ?? null,
    note: s.overall_note,
    teacherName: nameOf.get(s.reviewer_id) ?? "your teacher",
    mistakes: rows.filter((m) => m.session_id === s.id),
  }));
}

/** The teacher's own open draft on this surah, with its marks, or null. */
export async function draftHearing(
  teacherId: string,
  studentId: string,
  surah: number,
): Promise<{ id: string; mistakes: MistakeRow[] } | null> {
  const db = await supabaseServer();
  const { data: s } = await db
    .from("revision_sessions")
    .select("id")
    .eq("reviewer_id", teacherId)
    .eq("reciter_id", studentId)
    .eq("kind", "hearing")
    .eq("surah_number", surah)
    .is("submitted_at", null)
    .maybeSingle();
  if (!s) return null;
  const { data } = await db.from("revision_mistakes").select(MISTAKE_COLS).eq("session_id", s.id);
  return { id: s.id, mistakes: (data ?? []) as MistakeRow[] };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: clean. If `kind`, `outcome` or `surah_number` are unknown columns, Task 2 Step 3 did not regenerate the types — redo it.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hifz/hearing-queries.ts
git commit -m "feat(hifz): read a surah's hearings and the teacher's open draft

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Hearing actions

**Files:**
- Create: `web/src/lib/hifz/hearing-actions.ts`

- [ ] **Step 1: Write the module**

```ts
// web/src/lib/hifz/hearing-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireOwnStudent, requireTeacher } from "@/lib/teacher/guards";
import type { HearingOutcome } from "./hearings";

/**
 * The open hearing draft for this student and surah — reused if there is
 * one, inserted if not. Called on the FIRST TAP or the first verdict, never
 * on opening the page, so a teacher who opens a surah to look and leaves
 * creates no row. RLS (t_sessions_insert) guards the insert.
 */
export async function startHearing(studentId: string, surah: number): Promise<string> {
  const me = await requireTeacher();
  await requireOwnStudent(studentId);
  const db = await supabaseServer();

  const { data: existing } = await db
    .from("revision_sessions")
    .select("id")
    .eq("reviewer_id", me.id)
    .eq("reciter_id", studentId)
    .eq("kind", "hearing")
    .eq("surah_number", surah)
    .is("submitted_at", null)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await db
    .from("revision_sessions")
    .insert({ reviewer_id: me.id, reciter_id: studentId, kind: "hearing", surah_number: surah })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

const OUTCOMES: readonly string[] = ["passed", "not_passed"];

/**
 * The verdict. Passed writes the record FIRST: if that write fails the
 * hearing stays open, rather than a submitted hearing with no pass behind
 * it. The note is written to both the hearing and the record's
 * teacher_comment so everything that reads comments today keeps working.
 * The upsert leaves passed_at alone on a re-hearing — the date a surah was
 * first heard is never reset.
 */
export async function submitHearing(
  sessionId: string,
  outcome: HearingOutcome,
  note?: string,
): Promise<void> {
  const me = await requireTeacher();
  if (!OUTCOMES.includes(outcome)) throw new Error("Unknown outcome.");
  const db = await supabaseServer();

  const { data: s } = await db
    .from("revision_sessions")
    .select("id, reciter_id, surah_number")
    .eq("id", sessionId)
    .eq("reviewer_id", me.id)
    .eq("kind", "hearing")
    .is("submitted_at", null)
    .maybeSingle();
  if (!s || s.surah_number === null) throw new Error("Hearing already submitted or not yours.");
  await requireOwnStudent(s.reciter_id);
  const trimmed = note?.trim() || null;

  if (outcome === "passed") {
    const { error } = await db.from("hifz_records").upsert(
      {
        student_id: s.reciter_id,
        surah_number: s.surah_number,
        teacher_comment: trimmed,
        marked_by: me.id,
        session_id: s.id,
      },
      { onConflict: "student_id,surah_number" },
    );
    if (error) throw new Error(error.message);
  }

  const { error } = await db
    .from("revision_sessions")
    .update({ submitted_at: new Date().toISOString(), outcome, overall_note: trimmed })
    .eq("id", s.id)
    .is("submitted_at", null);
  if (error) throw new Error(error.message);

  revalidatePath("/hifz");
  revalidatePath(`/hifz/${s.surah_number}`);
  revalidatePath("/teacher/hifz");
  revalidatePath(`/teacher/hifz/${s.reciter_id}`);
  revalidatePath(`/teacher/hifz/${s.reciter_id}/${s.surah_number}`);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hifz/hearing-actions.ts
git commit -m "feat(hifz): start a hearing on the first tap; a verdict submits it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The student's surah page shows the teacher's marks

**Files:**
- Create: `web/src/components/app/surah-mushaf.tsx`
- Modify: `web/src/app/(student)/hifz/[surah]/page.tsx`

- [ ] **Step 1: Write the read-only scoped mushaf**

```tsx
// web/src/components/app/surah-mushaf.tsx
import { getCachedPageWords } from "@/lib/reference/cached";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import type { PageRange } from "@/lib/quran/page-within";
import { spreadHeat } from "@/lib/hifz/heat-spread";
import type { MistakeRow } from "@/lib/hifz/mistakes";
import { HeatViewer } from "./heat-viewer";
import { MushafPager } from "./mushaf-pager";
import type { SurahNames } from "./mushaf-reader";

/**
 * One printed page, tinted by the mistakes given, turning only within
 * `range` — the pages one surah occupies. Read-only: tapping a hot word
 * lists what went wrong there. The page is a whole printed page, so a
 * neighbouring surah's words show too; only this surah's mistakes are
 * passed in, so only its words can be hot.
 */
export async function SurahMushaf({
  page, range, mistakes, basePath, surahNames,
}: {
  page: number;
  range: PageRange;
  mistakes: MistakeRow[];
  basePath: string;
  surahNames?: SurahNames;
}) {
  const rows = await getCachedPageWords(page);
  const words = rows.map(fromRow);
  const { heat, history } = spreadHeat(words, mistakes, new Date());
  return (
    <MushafPager page={page} min={range.from} max={range.to} basePath={basePath} param="p">
      <HeatViewer pages={groupIntoPages(words)} heat={heat} history={history} surahNames={surahNames} />
    </MushafPager>
  );
}
```

- [ ] **Step 2: Load hearings on the student page**

In `web/src/app/(student)/hifz/[surah]/page.tsx`:

Add imports:

```ts
import { getCachedSurahPageRange } from "@/lib/reference/cached";
import { pageWithin } from "@/lib/quran/page-within";
import { hearingsFor } from "@/lib/hifz/hearing-queries";
import { recordLine } from "@/lib/hifz/hearings";
import { SurahMushaf } from "@/components/app/surah-mushaf";
import { Rule } from "@/components/app/rule";
import type { SurahNames } from "@/components/app/mushaf-reader";
```

Change the signature to accept the page param:

```ts
export default async function SurahPage({
  params,
  searchParams,
}: {
  params: Promise<{ surah: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const [{ surah: raw }, { p }] = await Promise.all([params, searchParams]);
```

(and delete the old `const { surah: raw } = await params;`).

Extend the `Promise.all` that loads `surahs, hp, rec` with two more reads:

```ts
  const [surahs, hp, rec, hearings, range] = await Promise.all([
    getCachedSurahs(),
    db
      .from("hifz_profiles")
      .select("start_surah, target_count")
      .eq("student_id", profile.id)
      .maybeSingle(),
    db
      .from("hifz_records")
      .select("passed_at, teacher_comment")
      .eq("student_id", profile.id)
      .eq("surah_number", number)
      .maybeSingle(),
    hearingsFor(profile.id, number),
    getCachedSurahPageRange(number),
  ]);
```

After `const record = rec.data;` add:

```ts
  // The latest submitted hearing carries the date and count; the record
  // carries the truth about "passed". recordLine reconciles the two.
  const latest = hearings[0] ?? null;
  const line = recordLine(
    record ? { passedAt: record.passed_at, comment: record.teacher_comment } : null,
    latest
      ? {
          submittedAt: latest.submittedAt,
          outcome: latest.outcome,
          teacherName: latest.teacherName,
          mistakeCount: latest.mistakes.length,
        }
      : null,
  );
  const hearingMistakes = hearings.flatMap((h) => h.mistakes);
  const surahNames: SurahNames = Object.fromEntries(
    surahs.map((s) => [s.number, { ar: s.name_ar, en: s.name_en }]),
  );
```

- [ ] **Step 3: Show the line and the mushaf**

In the record section, replace the passed branch's note:

```tsx
              <div className="note">Heard by your teacher on {fmtDay(record.passed_at)}.</div>
```

with:

```tsx
              <div className="note">{line}.</div>
```

and in the not-passed branch, replace:

```tsx
              <div className="note">
                {idx >= 0
                  ? "This one is still ahead of you. Your teacher hears it when you are ready."
                  : "This surah is not on your list this year."}
              </div>
```

with:

```tsx
              <div className="note">
                {latest
                  ? `${line}.`
                  : idx >= 0
                    ? "This one is still ahead of you. Your teacher hears it when you are ready."
                    : "This surah is not on your list this year."}
              </div>
```

Then, between the record `</div>` (the end of the "Your record" field) and the `{summary && (` block, insert:

```tsx
      {/* ── the surah itself, with the teacher's marks on it ── */}
      {range && idx >= 0 && (
        <>
          <Rule label="The mushaf" />
          <div className="field">
            <section className="box c12" aria-label="The surah, with your teacher's marks">
              <p className="note">
                {hearingMistakes.length > 0
                  ? "Tinted words are the ones your teacher marked. Tap one to see what went wrong."
                  : latest
                    ? "Your teacher marked no mistakes on this one."
                    : "Once your teacher has heard this surah, their marks show here."}
              </p>
              <SurahMushaf
                page={pageWithin(p, range)}
                range={range}
                mistakes={hearingMistakes}
                basePath={`/hifz/${number}`}
                surahNames={surahNames}
              />
            </section>
          </div>
        </>
      )}
```

- [ ] **Step 4: Typecheck, lint, build the page**

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: clean.

Run the app (`npm run dev`), sign in as a student who has a passed surah, open `/hifz/<that surah>`. Expected: the record line reads `Passed · heard on …` (no hearing yet), and a mushaf page renders under "The mushaf" with the page arrows limited to that surah's pages. Turn a page: the URL gains `?p=…` and stays within the range.

- [ ] **Step 5: Commit**

```bash
git add src/components/app/surah-mushaf.tsx "src/app/(student)/hifz/[surah]/page.tsx"
git commit -m "feat(hifz): a student's surah page carries the mushaf and the teacher's marks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The sheet shows earlier marks on a word

In a hearing, tapping a hot word classifies it (that is the point of the page), so the history has to live inside the classifier rather than replace it.

**Files:**
- Modify: `web/src/components/app/mistake-sheet.tsx`
- Create: `web/src/components/app/mistake-sheet.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/app/mistake-sheet.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MistakeSheet } from "./mistake-sheet";
import type { QuranWord } from "@/lib/quran/mushaf";

const word: QuranWord = {
  surah: 88, ayah: 17, position: 4, text: "ٱلْإِبِلِ", glyph: null, isEnd: false, page: 592, line: 3,
};

afterEach(cleanup);

describe("MistakeSheet", () => {
  it("lists earlier marks on the word above the picker", () => {
    render(
      <MistakeSheet
        word={word}
        previous={[
          { label: "Hifdh — Forgot it", note: "hesitated", date: "2026-09-10T00:00:00Z" },
          { label: "Tajweed — Madd length", note: null, date: "2026-08-20T00:00:00Z" },
        ]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const list = screen.getByRole("list", { name: "Earlier marks on this word" });
    expect(list.textContent).toContain("Hifdh — Forgot it");
    expect(list.textContent).toContain("hesitated");
    expect(list.textContent).toContain("Tajweed — Madd length");
  });

  it("shows no list when there is nothing earlier", () => {
    render(<MistakeSheet word={word} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole("list", { name: "Earlier marks on this word" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/app/mistake-sheet.test.tsx`
Expected: the first test FAILS (no such list); the second passes.

- [ ] **Step 3: Add the prop and the list**

In `web/src/components/app/mistake-sheet.tsx`, add the import:

```ts
import type { WordHistoryEntry } from "@/lib/hifz/heat-spread";
```

Add `previous` to the props:

```ts
export function MistakeSheet({
  word,
  existing,
  previous,
  onSave,
  onRemove,
  onClose,
}: {
  word: QuranWord | null;
  existing?: { category: Category; detail: string | null; note: string | null };
  previous?: WordHistoryEntry[];   // earlier, submitted marks on this word
  onSave: (r: SheetResult) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
```

Directly after `</DialogHeader>` insert:

```tsx
        {previous && previous.length > 0 && (
          // What earlier hearings said about this word — context for the
          // classification, not a substitute for it.
          <ul
            aria-label="Earlier marks on this word"
            className="space-y-1 rounded-md bg-muted px-2.5 py-1.5 text-xs"
          >
            {previous.map((e, i) => (
              <li key={i}>
                <span className="font-medium">{e.label}</span>
                <span className="ml-2 text-muted-foreground">
                  {new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
                {e.note && <span className="ml-2 text-ink-2">{e.note}</span>}
              </li>
            ))}
          </ul>
        )}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/app/mistake-sheet.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/app/mistake-sheet.tsx src/components/app/mistake-sheet.test.tsx
git commit -m "feat(hifz): the sheet shows what earlier hearings said about a word

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: The logger learns hearing mode

**Files:**
- Modify: `web/src/components/app/review-logger.tsx`
- Modify: `web/src/components/app/review-logger.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `web/src/components/app/review-logger.test.tsx`. First extend the mocks at the top of the file: after the existing `vi.mock("@/lib/hifz/review-actions", …)` block add:

```ts
vi.mock("@/lib/hifz/hearing-actions", () => ({
  submitHearing: vi.fn(async () => {}),
}));
import { submitHearing } from "@/lib/hifz/hearing-actions";
```

Then add a second `describe`:

```tsx
describe("ReviewLogger in hearing mode", () => {
  const ensure = () => vi.fn(async () => "h1");

  it("creates the draft on the first tap, then logs into it", async () => {
    const ensureSession = ensure();
    render(
      <ReviewLogger
        mode="hearing" sessionId={null} ensureSession={ensureSession}
        reciterName="Aisha" pages={pages} initialMistakes={[]}
      />,
    );
    expect(screen.getByText(/Hearing/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Finish" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "قُلْ" }));
    fireEvent.click(screen.getByRole("button", { name: "Hifdh" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/1 mistake/, undefined, { timeout: 10_000 })).toBeTruthy();
    expect(ensureSession).toHaveBeenCalledTimes(1);
    expect(logMistake).toHaveBeenCalledWith(
      "h1", { surah: 114, ayah: 1, position: 1 }, "hifz", undefined, "");
  }, SLOW);

  it("passes with a note through the verdict popup, creating the draft if needed", async () => {
    const ensureSession = ensure();
    render(
      <ReviewLogger
        mode="hearing" sessionId={null} ensureSession={ensureSession}
        reciterName="Aisha" pages={pages} initialMistakes={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Passed" }));
    fireEvent.change(screen.getByPlaceholderText("Note for the student (optional)"), {
      target: { value: "cleaner than last week" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm pass" }));
    await vi.waitFor(() => expect(submitHearing).toHaveBeenCalledWith("h1", "passed", "cleaner than last week"));
    expect(ensureSession).toHaveBeenCalledTimes(1);
  }, SLOW);

  it("reuses an existing draft for Not passed", async () => {
    const ensureSession = ensure();
    render(
      <ReviewLogger
        mode="hearing" sessionId="draft-9" ensureSession={ensureSession}
        reciterName="Aisha" pages={pages} initialMistakes={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Not passed" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm not passed" }));
    await vi.waitFor(() => expect(submitHearing).toHaveBeenCalledWith("draft-9", "not_passed", ""));
    expect(ensureSession).not.toHaveBeenCalled();
  }, SLOW);

  it("shows earlier marks for a hot word inside the sheet", () => {
    render(
      <ReviewLogger
        mode="hearing" sessionId="draft-9" ensureSession={ensure()}
        reciterName="Aisha" pages={pages} initialMistakes={[]}
        heat={{ "114:1:1": "bg-warn/20" }}
        history={{ "114:1:1": [{ label: "Hifdh — Forgot it", note: null, date: "2026-09-10T00:00:00Z" }] }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "قُلْ" }));
    expect(screen.getByRole("list", { name: "Earlier marks on this word" }).textContent).toContain("Forgot it");
  }, SLOW);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/components/app/review-logger.test.tsx`
Expected: the two original tests pass; the four new ones fail (no `mode` prop, no "Passed" button).

- [ ] **Step 3: Rewrite the logger**

Replace the whole of `web/src/components/app/review-logger.tsx` with:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MushafReader, type SurahNames } from "./mushaf-reader";
import { MushafPager } from "./mushaf-pager";
import { MistakeSheet, type SheetResult } from "./mistake-sheet";
import { logMistake, removeMistake, submitSession } from "@/lib/hifz/review-actions";
import { submitHearing } from "@/lib/hifz/hearing-actions";
import { SESSION_FLAGS, type Category } from "@/lib/hifz/mistake-taxonomy";
import type { HearingOutcome } from "@/lib/hifz/hearings";
import type { WordHistoryEntry } from "@/lib/hifz/heat-spread";
import { markKey, wordKey, type MushafPage, type QuranWord } from "@/lib/quran/mushaf";
import type { MistakeRow } from "@/lib/hifz/mistakes";

type Mark = { id?: string; category: Category; detail: string | null; note: string | null };

/** The tapped token's target: an ayah end marker classifies the whole ayah,
 *  anything else the single word. */
const targetOf = (w: QuranWord) => ({
  surah: w.surah, ayah: w.ayah, position: w.isEnd ? null : w.position,
});

/**
 * The live logging island: tap a word → classify → it tints. Tapping an
 * ayah's END MARKER classifies the whole ayah instead, which is the commoner
 * slip — one row, tinting every word in it. State is local (each tap is one
 * server action, no refresh); submit refreshes the page so the server swaps
 * this for whatever comes after.
 *
 * Two modes, one logger:
 *  · `peer` — a partner listening. "Listening to B · Finish" on top; Finish
 *    asks for flags and a note.
 *  · `hearing` — the teacher, on the Thursday lesson. "Hearing B" on top,
 *    the verdict bar below: Passed / Not passed, each with a note. The
 *    draft may not exist yet: `sessionId` is null until the first tap or
 *    verdict, when `ensureSession` creates it. `heat`/`history` paint what
 *    earlier hearings said about the same words.
 */
export function ReviewLogger({
  mode = "peer",
  sessionId,
  ensureSession,
  reciterName,
  pages,
  initialMistakes,
  heat,
  history,
  surahNames,
  pager,
}: {
  mode?: "peer" | "hearing";
  sessionId: string | null;
  ensureSession?: () => Promise<string>;   // required when sessionId is null
  reciterName: string;
  pages: MushafPage[];
  initialMistakes: MistakeRow[];   // the whole session — marks span pages
  heat?: Record<string, string>;                  // earlier hearings' tint
  history?: Record<string, WordHistoryEntry[]>;   // …and what they said
  surahNames?: SurahNames;
  pager?: { page: number; min: number; max: number; basePath: string; param?: string; step?: number };
}) {
  const router = useRouter();
  const [sid, setSid] = useState<string | null>(sessionId);
  const [marks, setMarks] = useState<Record<string, Mark>>(() =>
    Object.fromEntries(
      initialMistakes.map((m) => [
        markKey({ surah: m.surah_number, ayah: m.ayah_number, position: m.word_position }),
        { id: m.id, category: m.category, detail: m.detail, note: m.note },
      ]),
    ),
  );
  const [tapped, setTapped] = useState<QuranWord | null>(null);
  const [wrapUp, setWrapUp] = useState(false);
  const [verdict, setVerdict] = useState<HearingOutcome | null>(null);
  const [flags, setFlags] = useState<string[]>([]);
  const [overallNote, setOverallNote] = useState("");
  const [pending, startTransition] = useTransition();

  /** The session to write to, creating the draft on first use. */
  const session = async (): Promise<string> => {
    if (sid) return sid;
    if (!ensureSession) throw new Error("No session and no way to start one.");
    const id = await ensureSession();
    setSid(id);
    return id;
  };

  const save = (r: SheetResult) => {
    const word = tapped;
    if (!word) return;
    setTapped(null);
    startTransition(async () => {
      const target = targetOf(word);
      const id = await logMistake(
        await session(), target, r.category, r.detail ?? undefined, r.note,
      );
      setMarks((m) => ({
        ...m,
        [markKey(target)]: { id, category: r.category, detail: r.detail, note: r.note },
      }));
    });
  };

  const remove = () => {
    const word = tapped;
    if (!word) return;
    const key = markKey(targetOf(word));
    const mark = marks[key];
    setTapped(null);
    if (!mark?.id) return;
    startTransition(async () => {
      await removeMistake(mark.id!);
      setMarks((m) => {
        const next = { ...m };
        delete next[key];
        return next;
      });
    });
  };

  const submit = () =>
    startTransition(async () => {
      await submitSession(await session(), flags, overallNote);
      setWrapUp(false);
      router.refresh();
    });

  const confirmVerdict = () => {
    const outcome = verdict;
    if (!outcome) return;
    startTransition(async () => {
      await submitHearing(await session(), outcome, overallNote);
      setVerdict(null);
      router.refresh();
    });
  };

  const count = Object.keys(marks).length;
  const plural = count === 1 ? "mistake" : "mistakes";
  const existing = tapped ? marks[markKey(targetOf(tapped))] : undefined;
  // spreadHeat keys history by wordKey for every word, end markers included.
  const previous = tapped ? history?.[wordKey(tapped)] : undefined;

  const reader = (
    <MushafReader pages={pages} marks={marks} heat={heat} surahNames={surahNames} onWordTap={setTapped} />
  );

  return (
    <div className="space-y-3">
      <div className="glass sticky top-2 z-10 flex items-center justify-between rounded-xl px-4 py-2.5">
        <p className="text-sm">
          {mode === "hearing" ? "Hearing " : "Listening to "}
          <span className="font-medium">{reciterName}</span>
          <span className="ml-2 text-xs tabular-nums text-muted-foreground">
            {count} {plural}
          </span>
        </p>
        {mode === "peer" && (
          <Button size="sm" disabled={pending} onClick={() => setWrapUp(true)}>Finish</Button>
        )}
      </div>

      {pager ? <MushafPager {...pager}>{reader}</MushafPager> : reader}

      {mode === "hearing" && (
        <div className="glass sticky bottom-2 z-10 flex items-center justify-between rounded-xl px-4 py-2.5">
          <p className="text-xs tabular-nums text-muted-foreground">{count} {plural}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setVerdict("not_passed")}>
              Not passed
            </Button>
            <Button size="sm" disabled={pending} onClick={() => setVerdict("passed")}>
              Passed
            </Button>
          </div>
        </div>
      )}

      <MistakeSheet
        key={tapped ? markKey(targetOf(tapped)) : "closed"}
        word={tapped}
        existing={existing}
        previous={previous}
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
                    setFlags((cur) =>
                      e.target.checked ? [...cur, f.id] : cur.filter((x) => x !== f.id),
                    )
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

      <Dialog open={verdict !== null} onOpenChange={(o) => !o && setVerdict(null)}>
        <DialogContent className="max-w-sm space-y-3">
          <DialogHeader>
            <DialogTitle>{verdict === "passed" ? "Passed" : "Not passed"}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {count} {plural} marked. The note is optional and the student sees it.
          </p>
          <Textarea value={overallNote} onChange={(e) => setOverallNote(e.target.value)}
            placeholder="Note for the student (optional)" rows={3} />
          <Button disabled={pending} onClick={confirmVerdict}>
            {pending ? "Saving…" : verdict === "passed" ? "Confirm pass" : "Confirm not passed"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 4: Fix the peer call sites**

`sessionId` is now `string | null`, which the two peer call sites already satisfy (they pass a string). Nothing to change in `review-tab.tsx`. Confirm with the typecheck.

- [ ] **Step 5: Run the logger tests, then everything**

Run: `npx vitest run src/components/app/review-logger.test.tsx`
Expected: 6 passed.

Run: `npx tsc --noEmit -p . && npm run lint && npm test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/app/review-logger.tsx src/components/app/review-logger.test.tsx
git commit -m "feat(hifz): the logger hears — a verdict bar, a lazy draft, earlier marks underneath

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: The teacher's surah page

**Files:**
- Create: `web/src/components/app/record-actions.tsx`
- Create: `web/src/components/app/record-actions.test.tsx`
- Create: `web/src/app/teacher/hifz/[studentId]/[surah]/page.tsx`

- [ ] **Step 1: Write the failing test for the record actions**

```tsx
// web/src/components/app/record-actions.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { RecordActions } from "./record-actions";

const setComment = vi.hoisted(() => vi.fn(async (_id: string, _n: number, _c: string) => {}));
const unmark = vi.hoisted(() => vi.fn(async (_id: string, _n: number) => {}));
vi.mock("@/lib/hifz/actions", () => ({ setSurahComment: setComment, unmarkSurah: unmark }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("RecordActions", () => {
  it("saves only once the comment has changed", () => {
    const { getByRole } = render(<RecordActions studentId="s1" surah={88} comment="rushed" />);
    const save = getByRole("button", { name: "Save comment" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(getByRole("textbox"), { target: { value: "cleaner now" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(setComment).toHaveBeenCalledWith("s1", 88, "cleaner now");
  });

  it("undoes the pass without touching the comment", () => {
    const { getByRole } = render(<RecordActions studentId="s1" surah={88} comment="rushed" />);
    fireEvent.click(getByRole("button", { name: "Undo pass" }));
    expect(unmark).toHaveBeenCalledWith("s1", 88);
    expect(setComment).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/components/app/record-actions.test.tsx`
Expected: FAIL — cannot resolve `./record-actions`.

- [ ] **Step 3: Write the component**

```tsx
// web/src/components/app/record-actions.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { setSurahComment, unmarkSurah } from "@/lib/hifz/actions";

/**
 * What survives of the old marking panel: the comment on a surah already
 * passed, and the way back. Passing itself now happens through a hearing.
 */
export function RecordActions({
  studentId, surah, comment,
}: {
  studentId: string;
  surah: number;
  comment: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(comment ?? "");
  const [pending, start] = useTransition();
  const dirty = text.trim() !== (comment ?? "").trim();
  const run = (work: () => Promise<void>) =>
    start(async () => {
      await work();
      router.refresh();
    });

  return (
    <div className="space-y-2">
      <label className="label" htmlFor="record-comment">Comment for the student</label>
      <Textarea
        id="record-comment"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Tighten the madd in āyah 3 — the student reads this…"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || !dirty}
          onClick={() => run(() => setSurahComment(studentId, surah, text))}>
          {pending ? "Saving…" : "Save comment"}
        </Button>
        <Button size="sm" variant="outline" disabled={pending}
          onClick={() => run(() => unmarkSurah(studentId, surah))}>
          Undo pass
        </Button>
        <span className="text-xs text-muted-foreground">
          Undoing removes the pass; the hearings and their marks stay.
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/app/record-actions.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Write the page**

```tsx
// web/src/app/teacher/hifz/[studentId]/[surah]/page.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import {
  getCachedPageWords, getCachedSurahPageRange, getCachedSurahs,
} from "@/lib/reference/cached";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import { pageWithin } from "@/lib/quran/page-within";
import { memorisationList, type Surah } from "@/lib/hifz/pace";
import { SURAH_META } from "@/lib/hifz/surah-meta";
import { draftHearing, hearingsFor } from "@/lib/hifz/hearing-queries";
import { startHearing } from "@/lib/hifz/hearing-actions";
import { recordLine } from "@/lib/hifz/hearings";
import { spreadHeat } from "@/lib/hifz/heat-spread";
import { teacherClass } from "@/lib/teacher/scope";
import { ReviewLogger } from "@/components/app/review-logger";
import { RecordActions } from "@/components/app/record-actions";
import { Rule } from "@/components/app/rule";
import type { SurahNames } from "@/components/app/mushaf-reader";

export const dynamic = "force-dynamic";

/**
 * One surah, ready to be heard.
 *
 * This page IS the Thursday lesson: the student presents the surah, the
 * teacher taps each slip on the printed page as it happens, and ends with
 * Passed or Not passed. There is no start step — opening the page creates
 * nothing; the first tap or the first verdict does (see startHearing).
 * Words earlier hearings marked sit tinted underneath, so a slip that keeps
 * coming back is visible while it is being heard again.
 */
export default async function TeacherSurahPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string; surah: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const [{ studentId, surah: raw }, { p }] = await Promise.all([params, searchParams]);
  const number = Number(raw);
  if (!Number.isInteger(number) || !SURAH_META[number]) notFound();

  const profile = (await currentProfile())!;
  const db = await supabaseServer();

  const [mine, { data: student }, { data: hp }, surahs, { data: record }, hearings, draft, range] =
    await Promise.all([
      teacherClass(),
      db.from("profiles").select("full_name, class_id").eq("id", studentId).maybeSingle(),
      db.from("hifz_profiles").select("start_surah, target_count").eq("student_id", studentId).maybeSingle(),
      getCachedSurahs(),
      db.from("hifz_records").select("passed_at, teacher_comment")
        .eq("student_id", studentId).eq("surah_number", number).maybeSingle(),
      hearingsFor(studentId, number),
      draftHearing(profile.id, studentId, number),
      getCachedSurahPageRange(number),
    ]);
  if (!student) notFound();
  // Same scoping as the student's hifdh page: a teacher with a class of
  // their own sees only their own students.
  if (mine && student.class_id !== mine.id) notFound();

  const surah = surahs.find((s) => s.number === number);
  if (!surah || !range) notFound();
  // Only surahs on the student's run have a page — nothing else can be heard.
  const list = hp ? memorisationList(hp.start_surah, hp.target_count, surahs as Surah[]) : [];
  const idx = list.findIndex((s) => s.number === number);
  if (idx === -1) notFound();

  const page = pageWithin(p, range);
  const rows = await getCachedPageWords(page);
  const words = rows.map(fromRow);
  const { heat, history } = spreadHeat(words, hearings.flatMap((h) => h.mistakes), new Date());
  const surahNames: SurahNames = Object.fromEntries(
    surahs.map((s) => [s.number, { ar: s.name_ar, en: s.name_en }]),
  );

  const latest = hearings[0] ?? null;
  const line = recordLine(
    record ? { passedAt: record.passed_at, comment: record.teacher_comment } : null,
    latest
      ? {
          submittedAt: latest.submittedAt,
          outcome: latest.outcome,
          teacherName: latest.teacherName,
          mistakeCount: latest.mistakes.length,
        }
      : null,
  );
  const basePath = `/teacher/hifz/${studentId}/${number}`;

  return (
    <>
      <header className="masthead">
        <Link href={`/teacher/hifz/${studentId}`} className="backstep">
          <ArrowLeft className="size-[13px]" aria-hidden />
          {student.full_name}
        </Link>
        <h1 style={{ marginTop: 18 }}>
          <span dir="rtl" lang="ar" className="ar-quran surahtitle">{surah.name_ar}</span>
        </h1>
        <p>
          {surah.name_en} · {idx + 1} of {list.length} · {line}
        </p>
      </header>

      {record && (
        <>
          <Rule label="The record" />
          <div className="field">
            <section className="box c12">
              <RecordActions studentId={studentId} surah={number} comment={record.teacher_comment} />
            </section>
          </div>
        </>
      )}

      <Rule label={latest ? "Hear it again" : "Hear it"} />
      <div className="field">
        <section className="box c12" aria-label="The mushaf">
          <ReviewLogger
            mode="hearing"
            sessionId={draft?.id ?? null}
            ensureSession={startHearing.bind(null, studentId, number)}
            reciterName={student.full_name}
            pages={groupIntoPages(words)}
            initialMistakes={draft?.mistakes ?? []}
            heat={heat}
            history={history}
            surahNames={surahNames}
            pager={{ page, min: range.from, max: range.to, basePath, param: "p" }}
          />
        </section>
      </div>
    </>
  );
}
```

`startHearing.bind(null, studentId, number)` is how a server action with fixed arguments is handed to a client component; Next serialises the bound arguments.

- [ ] **Step 6: Typecheck, lint, and try it**

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: clean.

Run the app, sign in as a teacher, open `/teacher/hifz/<studentId>/<a surah on their run>` by typing the URL. Expected: masthead with the surah and "Not heard yet"; the mushaf on the surah's first page; the sticky bar with Not passed / Passed. Tap a word, pick Hifdh, Save: the word tints and the count reads 1. Reload: the mark is still there (the draft was created). Press Passed, type a note, Confirm pass. Expected: the page reloads with "Heard by <you> on <today> · passed · 1 mistake", "The record" section with the note, and the word tinted as heat with an empty draft. Then sign in as that student and open `/hifz/<surah>`: the same word is tinted; tapping it lists the mark.

- [ ] **Step 7: Commit**

```bash
git add src/components/app/record-actions.tsx src/components/app/record-actions.test.tsx "src/app/teacher/hifz/[studentId]/[surah]/page.tsx"
git commit -m "feat(hifz): the teacher's surah page is the hearing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Grid cells link to the surah page; the panel goes

**Files:**
- Modify: `web/src/components/app/hifz-grid.tsx`
- Modify: `web/src/components/app/hifz-grid.test.tsx`
- Modify: `web/src/app/globals.css` (the `.cell` rule, ~line 1743)
- Modify: `web/src/app/teacher/hifz/[studentId]/page.tsx:20-28` (doc comment)

- [ ] **Step 1: Rewrite the grid tests**

Replace the whole of `web/src/components/app/hifz-grid.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { HifzGrid, type MarkRow } from "./hifz-grid";

/** 43 surahs, An-Nas (114) down to Al-Qalam (68) — the standard run. */
const run = (passedTo: number, over: Partial<MarkRow> & { number?: number } = {}): MarkRow[] =>
  Array.from({ length: 43 }, (_, i) => {
    const base: MarkRow = {
      number: 114 - i,
      name_en: `S${114 - i}`,
      name_ar: `س${114 - i}`,
      passed: i < passedTo,
      comment: null,
      passedAt: i < passedTo ? "2026-09-19" : null,
    };
    return over.number === base.number ? { ...base, ...over } : base;
  });

const cellFor = (container: HTMLElement, nameEn: string) => {
  const cell = [...container.querySelectorAll("a.cell")].find((a) =>
    a.querySelector(".en")?.textContent?.startsWith(nameEn),
  );
  if (!cell) throw new Error(`no cell for ${nameEn}`);
  return cell as HTMLAnchorElement;
};

afterEach(cleanup);

describe("HifzGrid", () => {
  it("renders nothing without a run", () => {
    const { container } = render(<HifzGrid studentId="s1" rows={[]} expected={0} />);
    expect(container.innerHTML).toBe("");
  });

  it("marks the first unpassed surah as next and the passed ones as done", () => {
    const { container } = render(<HifzGrid studentId="s1" rows={run(3)} expected={3} />);
    expect(container.querySelectorAll(".cell.done").length).toBe(3);
    expect(cellFor(container, "S111").className).toContain("next");
  });

  it("links every cell to that surah's page for this student", () => {
    const { container } = render(<HifzGrid studentId="s1" rows={run(0)} expected={0} />);
    expect(cellFor(container, "S114").getAttribute("href")).toBe("/teacher/hifz/s1/114");
    expect(cellFor(container, "S100").getAttribute("href")).toBe("/teacher/hifz/s1/100");
    expect(container.querySelector(".markpanel")).toBeNull();
  });

  it("flags a cell that carries a comment", () => {
    const rows = run(2, { number: 113, comment: "rushed the ending" });
    const { container } = render(<HifzGrid studentId="s1" rows={rows} expected={2} />);
    expect(cellFor(container, "S113").querySelector(".cmt")).not.toBeNull();
    expect(cellFor(container, "S112").querySelector(".cmt")).toBeNull();
  });

  it("shows the pace rule only when the student is genuinely behind", () => {
    const behind = render(<HifzGrid studentId="s1" rows={run(2)} expected={8} />);
    expect(behind.container.textContent).toContain("Expected here by now");
    cleanup();

    // expected = passed + 1 lands on the surah they are already on: no rule.
    const onIt = render(<HifzGrid studentId="s1" rows={run(8)} expected={9} />);
    expect(onIt.container.textContent).not.toContain("Expected here by now");
    cleanup();

    const done = render(<HifzGrid studentId="s1" rows={run(43)} expected={30} />);
    expect(done.container.textContent).not.toContain("Expected here by now");
    expect(done.container.querySelector(".cell.next")).toBeNull();
  });

  it("says a hizb is ready for the check only when all of it is on the run and passed", () => {
    // The run starts at An-Nas, so its first band is hizb 60 entire (114–78).
    const { container } = render(<HifzGrid studentId="s1" rows={run(43)} expected={43} />);
    expect(container.textContent).toContain("ready for the check");
  });
});
```

- [ ] **Step 2: Run to see the link test fail**

Run: `npx vitest run src/components/app/hifz-grid.test.tsx`
Expected: "links every cell…" FAILS (cells are buttons); several others fail on `a.cell` too.

- [ ] **Step 3: Rewrite the grid**

Replace the whole of `web/src/components/app/hifz-grid.tsx` with:

```tsx
import Link from "next/link";
import { hizbOf, HIZB_BOUNDS } from "@/lib/hifz/hizb";
import { SURAH_META } from "@/lib/hifz/surah-meta";
import { cn } from "@/lib/utils";

export type MarkRow = {
  number: number;
  name_en: string;
  name_ar: string;
  passed: boolean;
  comment: string | null;
  /** date, or null when the surah has no record yet */
  passedAt: string | null;
};

/**
 * The teacher's view of the run — the student's own mushaf index, each
 * cell a door.
 *
 * The teacher used to sign surahs off down a list of forty-odd rows, which
 * gave away the one thing the student's view has: the run as a single shape,
 * banded by hizb, so where a student actually is takes no reading. This is
 * that grid, and the same page now looks like the page the student is
 * looking at when they talk about it.
 *
 * A cell links to the surah's page, which is where a surah is heard: the
 * mushaf, the marks, the verdict. The sign-off panel that used to open
 * under a band is gone — passing a surah follows a hearing, and two places
 * to mark the same surah is how records drift.
 *
 * Server component: nothing here needs state any more.
 */
export function HifzGrid({
  studentId,
  rows,
  expected,
}: {
  studentId: string;
  rows: MarkRow[];
  expected: number;
}) {
  if (rows.length === 0) return null;

  const passedCount = rows.filter((r) => r.passed).length;
  const currentIdx = rows.findIndex((r) => !r.passed); // -1 → whole run passed
  // Same rule as the student's view: no marker before there is an expectation,
  // none when it lands on the surah they are already on, none when on pace.
  const rawMarker = expected > 0 ? Math.min(expected, rows.length) - 1 : null;
  const markerIdx =
    rawMarker !== null && currentIdx !== -1 && rawMarker !== currentIdx && expected !== passedCount
      ? rawMarker
      : null;

  // Contiguous hizb groups over the run, each item keeping its global index.
  const groups: { hizb: number; items: { r: MarkRow; i: number }[] }[] = [];
  rows.forEach((r, i) => {
    const h = hizbOf(r.number);
    if (h === null) return;
    const last = groups[groups.length - 1];
    if (last && last.hizb === h) last.items.push({ r, i });
    else groups.push({ hizb: h, items: [{ r, i }] });
  });

  return (
    <section className="box c12 hifzindex" aria-label="Hifdh run">
      <p className="note">Open a surah to hear it, or to see how it was heard.</p>

      {groups.map((g) => {
        const bound = HIZB_BOUNDS.find((b) => b.hizb === g.hizb);
        const inHizb = bound ? bound.to - bound.from + 1 : g.items.length;
        const done = g.items.filter((x) => x.r.passed).length;
        // "Ready for the check" only when the WHOLE hizb is on this student's
        // run and passed — a partial hizb can never be checked.
        const ready = done === g.items.length && g.items.length === inHizb;

        return (
          <div key={g.hizb}>
            <div className="band">
              <span className="t">Hizb {g.hizb}</span>
              <span className="r" />
              <span className={cn("st", !ready && "wait")}>
                {done} of {g.items.length}
                {ready && " · ready for the check"}
              </span>
            </div>

            <div className="index">
              {g.items.map(({ r, i }) => {
                const meta = SURAH_META[r.number];
                return (
                  <Link
                    key={r.number}
                    href={`/teacher/hifz/${studentId}/${r.number}`}
                    className={cn("cell", r.passed && "done", i === currentIdx && "next")}
                  >
                    <span className="n">{String(i + 1).padStart(2, "0")}</span>
                    {i === currentIdx && <span className="tag">NEXT</span>}
                    {r.comment && (
                      <span className="cmt" aria-hidden>
                        <svg viewBox="0 0 24 24">
                          <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z" />
                        </svg>
                      </span>
                    )}
                    <span dir="rtl" lang="ar" className="ar-quran">{r.name_ar}</span>
                    <span className="en">
                      {r.name_en}
                      <span className="sr-only">
                        {meta && `, ${meta.meaning}`}
                        {r.passed ? ", signed off" : ", not signed off"}
                        {r.comment && ", has a comment"}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>

            {markerIdx !== null && g.items.some((x) => x.i === markerIdx) && (
              <div className="paceline">
                <span className="t">Expected here by now</span>
                <span className="r" />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 4: Anchors must not underline**

In `web/src/app/globals.css`, in the `.cell { … }` rule (around line 1743), add `text-decoration: none;` after `color: inherit;`.

- [ ] **Step 5: Update the page's doc comment**

In `web/src/app/teacher/hifz/[studentId]/page.tsx` replace the sentence `Marking hangs off the cells; see HifzGrid.` in the doc comment with `Each cell opens the surah's page, where it is heard and passed.`

- [ ] **Step 6: Run the grid tests, then everything**

Run: `npx vitest run src/components/app/hifz-grid.test.tsx`
Expected: 6 passed.

Run: `npx tsc --noEmit -p . && npm run lint && npm test`
Expected: clean. Search for any remaining reference to the deleted panel: `grep -rn "markpanel\|MarkPanel" src` should print only CSS (`.markpanel` styling in `globals.css`, which can stay).

- [ ] **Step 7: Look at it**

Run the app as a teacher, open a student's hifdh page. Expected: the grid looks as before, cells have no underline, clicking one goes to the surah page, the pace rule and comment marks still show.

- [ ] **Step 8: Commit**

```bash
git add src/components/app/hifz-grid.tsx src/components/app/hifz-grid.test.tsx src/app/globals.css "src/app/teacher/hifz/[studentId]/page.tsx"
git commit -m "feat(hifz): a grid cell opens the surah; the marking panel goes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Live RLS check

There is no way to sign in as a teacher from a test, so the check runs as SQL that switches to the `authenticated` role with a chosen user's claims, inside one transaction that undoes itself. It is run through `--probe`, which writes no ledger row.

**Files:**
- Create: `web/supabase/checks/hearings_rls.sql`

- [ ] **Step 1: Find a teacher and one of their students**

From the repo root:

```bash
npx tsx execution/apply_migration.ts --probe "select t.id as teacher, s.id as student from profiles t join profiles s on s.class_id = t.class_id and s.role = 'student' and s.is_active where t.role = 'teacher' limit 1"
```

Note the two UUIDs.

- [ ] **Step 2: Write the check**

Replace `TEACHER_UUID` and `STUDENT_UUID` with the two ids before running; keep the committed file with the placeholders and a comment saying so.

```sql
-- Live RLS check for teacher hearings. Runs as `authenticated` with a
-- chosen user's claims, and undoes everything at the end. Substitute the
-- two ids, then from the repo root:
--   npx tsx execution/apply_migration.ts --probe web/supabase/checks/hearings_rls.sql
-- Every check raises on failure; success prints one row: "hearings rls ok".
do $$
declare
  teacher uuid := 'TEACHER_UUID';
  student uuid := 'STUDENT_UUID';
  sid uuid;
  n int;
begin
  -- ── as the teacher ──────────────────────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into revision_sessions (reviewer_id, reciter_id, kind, surah_number)
    values (teacher, student, 'hearing', 114) returning id into sid;
  insert into revision_mistakes (session_id, surah_number, ayah_number, word_position, category, detail)
    values (sid, 114, 1, 1, 'hifz', 'forgot');

  -- a teacher cannot create a PEER session
  begin
    insert into revision_sessions (reviewer_id, reciter_id, kind)
      values (teacher, student, 'peer');
    raise exception 'teacher was allowed to insert a peer session';
  exception when insufficient_privilege or check_violation then null;
  end;

  reset role;

  -- ── as the student, before submit ───────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', student, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from revision_sessions where id = sid;
  if n <> 0 then raise exception 'student saw an unsubmitted hearing'; end if;
  select count(*) into n from revision_mistakes where session_id = sid;
  if n <> 0 then raise exception 'student saw mistakes of an unsubmitted hearing'; end if;

  -- a student cannot create a hearing
  begin
    insert into revision_sessions (reviewer_id, reciter_id, kind, surah_number)
      values (student, teacher, 'hearing', 114);
    raise exception 'student was allowed to insert a hearing';
  exception when insufficient_privilege or check_violation then null;
  end;

  reset role;

  -- ── submit as the teacher, read as the student ──────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update revision_sessions set submitted_at = now(), outcome = 'not_passed' where id = sid;
  reset role;

  perform set_config('request.jwt.claims',
    json_build_object('sub', student, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from revision_sessions where id = sid;
  if n <> 1 then raise exception 'student cannot see a submitted hearing'; end if;
  select count(*) into n from revision_mistakes where session_id = sid;
  if n <> 1 then raise exception 'student cannot see the mistakes of a submitted hearing'; end if;
  reset role;

  -- ── undo ────────────────────────────────────────────────────────
  delete from revision_sessions where id = sid;   -- mistakes cascade
  raise notice 'hearings rls ok';
end $$;
select 'hearings rls ok' as result;
```

- [ ] **Step 3: Run it**

From the repo root, with the ids substituted in a scratch copy (do not commit the ids):

```bash
sed -e "s/TEACHER_UUID/<teacher id>/" -e "s/STUDENT_UUID/<student id>/" web/supabase/checks/hearings_rls.sql > /tmp/hearings_rls.sql
npx tsx execution/apply_migration.ts --probe /tmp/hearings_rls.sql
```

Expected: a JSON result containing `"result": "hearings rls ok"`. Any raised message names the failing rule; fix the migration and re-apply before continuing. If the API refuses `set local role` (it runs the query as the Postgres superuser, which may set any role, so this is not expected), say so in the handover rather than skipping the check.

- [ ] **Step 4: Commit**

```bash
git add supabase/checks/hearings_rls.sql
git commit -m "test(hifz): live RLS check for hearings — who may insert, who may read, and when

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Verify the whole, then reconcile the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-09-15-teacher-hearing-design.md`

- [ ] **Step 1: Full checks**

From `web/`:

```bash
npx tsc --noEmit -p . && npm run lint && npm test && npm run build
```

Expected: all clean; the build lists `/teacher/hifz/[studentId]/[surah]` among the routes.

- [ ] **Step 2: Manual walk-through**

With the dev server running:

1. Teacher: open a student, tap an unpassed surah, press Passed with nothing tapped, confirm. One press each; the page returns with "passed · 0 mistakes" and the grid cell shows as done.
2. Teacher: open the next surah, tap three words, close the tab, reopen the URL. The three marks are there. Press Not passed, confirm. The page shows "not passed · 3 mistakes", the words tinted as heat, no record section.
3. Teacher: same surah, tap one of the tinted words. The sheet lists the earlier mark above the picker.
4. Student: open that surah. Exactly those three words are tinted; tapping one shows the mark and the date. The record reads "Heard by … · not passed · 3 mistakes".
5. Teacher: on a passed surah, edit the comment and save; the student's page shows the new comment. Press Undo pass; the teacher's page reads "not signed off"; the student's reads the same, with the marks still tinted.

- [ ] **Step 3: Bring the spec in line**

In `docs/superpowers/specs/2026-09-15-teacher-hearing-design.md`:

- Change `0024_teacher_hearings.sql` to `0029_teacher_hearings.sql`.
- In the teacher page section, replace the sentence `Tapping a hot word with no draft mark shows its history (what, when).` with `Tapping a hot word opens the classifier as usual, with what earlier hearings said about that word listed above the picker.`
- In "Row-level security", after the three bullets, add: `In practice only the session insert needed a new policy: the existing reviewer policies on update and on mistake insert/delete check reviewer_id = auth.uid() with no role test, so they admit a teacher as they stand.`
- In "Testing", replace the live-test bullet with: `Live RLS check: supabase/checks/hearings_rls.sql, run through apply_migration.ts --probe as the teacher and as the student inside one self-undoing transaction.`

- [ ] **Step 4: Commit**

```bash
cd ..   # repo root
git add docs/superpowers/specs/2026-09-15-teacher-hearing-design.md
git commit -m "docs(hifz): the hearing spec matches what was built

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: Report**

Say what was verified by test, what by hand, and the one thing left deliberately: the peer Review tab's feedback view is unchanged and its visualisation is a separate decision.
