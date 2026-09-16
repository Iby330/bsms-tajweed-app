# Range Hearings and the Hearing Desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teacher hears a student's several surahs from one scrolling mushaf, presses Finish once, confirms the range with a tick per surah, and the ticked surahs are signed off; unticked ones show red as heard-not-passed on both sides.

**Architecture:** A hearing gains an end surah (`to_surah_number`) beside its start; the `outcome` column goes. A surah's state is derived from records and hearing ranges by one pure rule. One `HearingFinish` popup replaces the verdict buttons in both hearing pages. A new desk page renders every seeded page in one column, tracks the page in view, and starts at the student's next surah.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase (Postgres + RLS), Tailwind v4, vitest + @testing-library/react. Spec: `docs/superpowers/specs/2026-09-16-range-hearings-design.md`. Base: branch `feat/teacher-hearings` at its current head (the per-surah hearing work).

---

## Conventions you must know

- App code is under `web/`; run `npm`/`npx` from `web/` unless a step says the repo root.
- Tests: `npx vitest run <file>`; `npm test` for the suite. Typecheck: `npx tsc --noEmit -p .`. Lint: `npx eslint <files>` — the repo has ~31 pre-existing lint errors in unrelated chart hooks; only make sure files you touch add no diagnostics.
- Never `git add -A`; stage only what you touched. Commit messages lowercase like the log, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Do not run the dev server, sign in, or change live accounts. The only live writes are the migration (Task 1) and the self-undoing security check (Task 9).
- Database: `npx tsx execution/apply_migration.ts <file>` from the repo root; `--probe "<sql>"` runs read-only SQL with no ledger row. Types regenerate through the Management API (Task 1 shows how).
- Memorisation order runs DOWN the mushaf: An-Nas (114) first, then 113, … so a range's `from` is the higher number and `to` the lower. `rangeSurahs(88, 86)` is `[88, 87, 86]`.
- Mushaf helpers: `wordKey`, `ayahKey`, `markKey`, `fromRow`, `groupIntoPages` in `src/lib/quran/mushaf.ts`. `MistakeRow` and `MISTAKE_COLS` in `src/lib/hifz/mistakes.ts`. Seeded pages are 562–604.

## File map

| File | Responsibility |
| --- | --- |
| `web/supabase/migrations/0030_range_hearings.sql` (new) | `to_surah_number`, drop `outcome` |
| `web/src/lib/database.types.ts` | regenerated |
| `web/src/lib/hifz/hearings.ts` | pure: `surahState`, `covers`, `rangeSurahs`, `endSurahFor`, `lastSurahOn`, `recordLine`, `commentToShow`, `summaryOf` |
| `web/src/lib/hifz/hearing-queries.ts` | `hearingsForStudent`, `hearingMistakesFor`, `hearingsFor` (by range), `openDraftFor` |
| `web/src/lib/hifz/hearing-actions.ts` | `startHearing(studentId, from)`, `submitHearing(sessionId, verdict)` |
| `web/src/lib/reference/cached.ts` | `getCachedAllPageWords` |
| `web/src/components/app/hearing-finish.tsx` (new) | the Finish popup: range rows with ticks, movers, note, confirm |
| `web/src/components/app/review-logger.tsx` | hearing mode: `from`, page-in-view tracking, `HearingFinish`; verdict bar removed |
| `web/src/components/app/mushaf-reader.tsx` | `id="page-N"` on each page |
| `web/src/components/app/use-page-in-view.ts` (new) | IntersectionObserver hook |
| `web/src/app/teacher/hifz/hear/page.tsx` (new) | the desk |
| `web/src/components/app/hearing-desk.tsx` (new) | client shell: student picker, start chip, logger, done line, next student |
| `web/src/components/app/hifz-tabs.tsx` | optional third tab, Hear |
| `web/src/app/teacher/hifz/page.tsx` | "Hear a student" link |
| `web/src/app/teacher/hifz/[studentId]/page.tsx`, `[surah]/page.tsx` | derived state, heard set, open-draft redirect |
| `web/src/app/(student)/hifz/page.tsx`, `[surah]/page.tsx` | derived state, heard set |
| `web/src/components/app/hifz-journey.tsx`, `hifz-grid.tsx`, `web/src/app/globals.css` | the red `redo` cell |
| `web/supabase/checks/hearings_rls.sql` | drop the `outcome` write |

---

### Task 1: Migration — a hearing has an end; outcome goes

**Files:**
- Create: `web/supabase/migrations/0030_range_hearings.sql`
- Modify: `web/src/lib/database.types.ts` (regenerated)

- [ ] **Step 1: Write the migration**

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- Range hearings: a hearing runs from one surah to another, and its
-- per-surah result is derived from the pass records, so `outcome` goes.
-- Spec: docs/superpowers/specs/2026-09-16-range-hearings-design.md
-- Every statement idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- Memorisation order runs down the mushaf, so the end is the LOWER number.
-- A hearing of one surah has the two equal.
alter table revision_sessions add column if not exists to_surah_number int references surahs(number);

-- Hearings made before this column existed were one surah each.
update revision_sessions set to_surah_number = surah_number
  where kind = 'hearing' and to_surah_number is null;

alter table revision_sessions drop constraint if exists revision_sessions_hearing_to_check;
alter table revision_sessions add constraint revision_sessions_hearing_to_check
  check ((kind = 'hearing') = (to_surah_number is not null));

alter table revision_sessions drop constraint if exists revision_sessions_range_order_check;
alter table revision_sessions add constraint revision_sessions_range_order_check
  check (to_surah_number is null or to_surah_number <= surah_number);

-- The verdict is per surah now and lives in hifz_records: a record exists
-- only while the latest word on that surah was a pass. Nothing reads
-- `outcome` any more.
alter table revision_sessions drop constraint if exists revision_sessions_outcome_check;
alter table revision_sessions drop constraint if exists revision_sessions_peer_no_outcome_check;
alter table revision_sessions drop column if exists outcome;
```

- [ ] **Step 2: Apply and verify** (repo root)

```bash
npx tsx execution/apply_migration.ts web/supabase/migrations/0030_range_hearings.sql
npx tsx execution/apply_migration.ts --probe "select column_name from information_schema.columns where table_name = 'revision_sessions' and column_name in ('outcome','to_surah_number')"
```
Expected: only `to_surah_number`. Then `--probe "select count(*) from revision_sessions where kind = 'hearing' and to_surah_number is null"` → 0.

- [ ] **Step 3: Regenerate types** (from `web/`, same credentials the apply script reads — see its header)

```bash
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/types/typescript" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).types))' \
  > src/lib/database.types.ts
grep -c "to_surah_number" src/lib/database.types.ts; grep -c "outcome" src/lib/database.types.ts
```
Expected: first ≥ 3, second 0 (or only unrelated matches — check them). `npx tsc --noEmit -p .` will now FAIL in `hearing-queries.ts`, `hearing-actions.ts`, `review-logger.tsx` and the pages because `outcome` is gone: that is expected and Tasks 2–5 fix it. Do not patch around it here.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0030_range_hearings.sql src/lib/database.types.ts
git commit -m "feat(hifz): a hearing runs from one surah to another; outcome goes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The derived state and the range helpers

**Files:**
- Modify: `web/src/lib/hifz/hearings.ts` (rewrite)
- Modify: `web/src/lib/hifz/hearings.test.ts` (rewrite)

- [ ] **Step 1: Write the failing tests** — replace the whole test file with:

```ts
// web/src/lib/hifz/hearings.test.ts
import { describe, it, expect } from "vitest";
import { fmtDay, fmtStamp } from "@/lib/format";
import {
  commentToShow, covers, endSurahFor, lastSurahOn, rangeSurahs, recordLine, summaryOf, surahState,
} from "./hearings";
import type { MushafPage } from "@/lib/quran/mushaf";

const when = "2026-09-10T10:00:00Z";
const heard = { submittedAt: when, teacherName: "Ustadh Bilal", mistakeCount: 3 };
const record = { passedAt: "2026-09-10", comment: null };

describe("covers / rangeSurahs", () => {
  it("covers runs from the higher number down to the lower", () => {
    expect(covers({ from: 88, to: 86 }, 87)).toBe(true);
    expect(covers({ from: 88, to: 86 }, 88)).toBe(true);
    expect(covers({ from: 88, to: 86 }, 86)).toBe(true);
    expect(covers({ from: 88, to: 86 }, 89)).toBe(false);
    expect(covers({ from: 88, to: 86 }, 85)).toBe(false);
  });
  it("lists a range in memorisation order", () => {
    expect(rangeSurahs(88, 86)).toEqual([88, 87, 86]);
    expect(rangeSurahs(88, 88)).toEqual([88]);
  });
});

describe("surahState", () => {
  const passed = new Set([114, 113]);
  const hearings = [{ from: 113, to: 111 }];
  it("passed wins whenever a record exists", () => {
    expect(surahState(113, passed, hearings)).toBe("passed");
    expect(surahState(114, passed, hearings)).toBe("passed");   // legacy pass, no hearing
  });
  it("a covering hearing without a record is not passed", () => {
    expect(surahState(112, passed, hearings)).toBe("not_passed");
    expect(surahState(111, passed, hearings)).toBe("not_passed");
  });
  it("nothing is unheard", () => {
    expect(surahState(110, passed, hearings)).toBe("unheard");
  });
});

describe("endSurahFor", () => {
  it("ends on the surah under the last word of the page in view", () => {
    expect(endSurahFor(88, 86, [])).toBe(86);
  });
  it("a page before the start ends on the start", () => {
    expect(endSurahFor(88, 90, [])).toBe(88);
    expect(endSurahFor(88, null, [])).toBe(88);
  });
  it("widens to cover the furthest mark", () => {
    expect(endSurahFor(88, 87, [88, 85])).toBe(85);
  });
  it("marks behind the start cannot widen backwards", () => {
    expect(endSurahFor(88, 88, [90])).toBe(88);
  });
});

describe("lastSurahOn", () => {
  const page = (n: number, surahs: number[]): MushafPage => ({
    page: n,
    lines: surahs.map((s, i) => ({
      line: i + 1,
      words: [{ surah: s, ayah: 1, position: 1, text: "x", glyph: null, isEnd: false, page: n, line: i + 1 }],
    })),
  });
  it("is the surah of the last word on that page", () => {
    expect(lastSurahOn([page(592, [88]), page(593, [88, 87])], 593)).toBe(87);
  });
  it("is null for a page not in the set", () => {
    expect(lastSurahOn([page(592, [88])], 600)).toBeNull();
  });
});

describe("recordLine", () => {
  it("reads passed with a hearing", () => {
    expect(recordLine("passed", record, heard)).toBe(
      `Heard by Ustadh Bilal on ${fmtStamp(when)} · passed · 3 mistakes`,
    );
  });
  it("reads not passed", () => {
    expect(recordLine("not_passed", null, { ...heard, mistakeCount: 1 })).toBe(
      `Heard by Ustadh Bilal on ${fmtStamp(when)} · not passed · 1 mistake`,
    );
  });
  it("describes a pass from before hearings existed", () => {
    expect(recordLine("passed", record, null)).toBe(`Passed · heard on ${fmtDay("2026-09-10")}`);
  });
  it("says so when nothing has happened", () => {
    expect(recordLine("unheard", null, null)).toBe("Not heard yet");
  });
});

describe("commentToShow", () => {
  const latest = { note: "tighten the madd", submittedAt: when };
  it("a passed surah shows its pass comment", () => {
    expect(commentToShow("passed", { ...record, comment: "well read" }, latest)).toEqual({
      text: "well read", date: "2026-09-10", kind: "record",
    });
  });
  it("a passed surah with no comment shows nothing, even with a hearing note", () => {
    expect(commentToShow("passed", record, latest)).toBeNull();
  });
  it("a not-passed surah shows the latest hearing's note", () => {
    expect(commentToShow("not_passed", null, latest)).toEqual({
      text: "tighten the madd", date: when, kind: "hearing",
    });
  });
  it("nothing → null", () => {
    expect(commentToShow("unheard", null, null)).toBeNull();
    expect(commentToShow("not_passed", null, { note: null, submittedAt: when })).toBeNull();
  });
});

describe("summaryOf", () => {
  it("null and undefined give null", () => {
    expect(summaryOf(null)).toBeNull();
    expect(summaryOf(undefined)).toBeNull();
  });
  it("reduces a hearing to what the line needs", () => {
    expect(summaryOf({ submittedAt: when, teacherName: "Ustadh Bilal", mistakes: [1, 2, 3] })).toEqual(heard);
  });
});
```

- [ ] **Step 2: Run it to see it fail** — `npx vitest run src/lib/hifz/hearings.test.ts` → FAIL (missing exports, changed signatures).

- [ ] **Step 3: Rewrite the module**

```ts
// web/src/lib/hifz/hearings.ts
import { fmtDay, fmtStamp } from "@/lib/format";
import type { MushafPage } from "@/lib/quran/mushaf";

/** Where a surah stands. Derived, never stored (see surahState). */
export type SurahState = "passed" | "not_passed" | "unheard";

/** A submitted hearing's range. `from` is the higher surah number: the run
 *  goes An-Nas (114) first and works down the mushaf. */
export type HearingRange = { from: number; to: number };

/** Does this hearing's range cover the surah? */
export const covers = (h: HearingRange, surah: number): boolean =>
  h.from >= surah && surah >= h.to;

/** The surahs of a range, in memorisation order: from down to to. */
export const rangeSurahs = (from: number, to: number): number[] =>
  Array.from({ length: from - to + 1 }, (_, i) => from - i);

/**
 * The one rule every page uses. A pass record exists only while the latest
 * word on that surah was a pass — unticking it at Finish deletes the record
 * — so a record wins outright. A covering hearing without one is a fail.
 * Nothing is nothing. Passes from before hearings existed have no covering
 * hearing and read as passed.
 */
export function surahState(
  surah: number,
  passed: ReadonlySet<number>,
  hearings: readonly HearingRange[],
): SurahState {
  if (passed.has(surah)) return "passed";
  return hearings.some((h) => covers(h, surah)) ? "not_passed" : "unheard";
}

/**
 * Where a hearing ends when Finish is pressed: the surah containing the
 * last word on the page in view, widened so every marked surah is inside
 * the range. A page before the start (a higher surah, or no page) means
 * the end is the start; marks behind the start cannot widen backwards.
 */
export function endSurahFor(
  from: number,
  lastSurahOnPage: number | null,
  markSurahs: Iterable<number>,
): number {
  let end = lastSurahOnPage === null || lastSurahOnPage > from ? from : lastSurahOnPage;
  for (const s of markSurahs) if (s < end) end = s;
  return end;
}

/** The surah of the last word on a page, or null when the page is not in the set. */
export function lastSurahOn(pages: readonly MushafPage[], page: number): number | null {
  const p = pages.find((x) => x.page === page);
  const last = p?.lines.at(-1)?.words.at(-1);
  return last ? last.surah : null;
}

/** The latest submitted hearing covering a surah, reduced to what the line needs. */
export type HearingSummary = { submittedAt: string; teacherName: string; mistakeCount: number };

/** The pass record, if the surah has one. */
export type RecordSummary = { passedAt: string; comment: string | null };

/** The one line under a surah's name that says where it stands. */
export function recordLine(
  state: SurahState,
  record: RecordSummary | null,
  hearing: HearingSummary | null,
): string {
  if (!hearing) {
    return state === "passed" && record ? `Passed · heard on ${fmtDay(record.passedAt)}` : "Not heard yet";
  }
  const n = hearing.mistakeCount;
  const mistakes = `${n} mistake${n === 1 ? "" : "s"}`;
  const status = state === "passed" ? "passed" : "not passed";
  return `Heard by ${hearing.teacherName} on ${fmtStamp(hearing.submittedAt)} · ${status} · ${mistakes}`;
}

/** What the student reads under the surah: the pass comment while it is
 *  passed, else the latest hearing's note. */
export function commentToShow(
  state: SurahState,
  record: RecordSummary | null,
  latest: { note: string | null; submittedAt: string } | null,
): { text: string; date: string; kind: "hearing" | "record" } | null {
  if (state === "passed") {
    return record?.comment ? { text: record.comment, date: record.passedAt, kind: "record" } : null;
  }
  if (latest?.note) return { text: latest.note, date: latest.submittedAt, kind: "hearing" };
  return null;
}

/** The latest hearing, reduced to what recordLine needs; null when there is none. */
export function summaryOf(
  hearing: { submittedAt: string; teacherName: string; mistakes: unknown[] } | null | undefined,
): HearingSummary | null {
  if (!hearing) return null;
  return { submittedAt: hearing.submittedAt, teacherName: hearing.teacherName, mistakeCount: hearing.mistakes.length };
}
```

- [ ] **Step 4: Run the test** → all pass. `npx tsc --noEmit -p .` will still fail in files not yet migrated (queries, actions, logger, pages): expected until Task 5. Confirm the ONLY errors are in those files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hifz/hearings.ts src/lib/hifz/hearings.test.ts
git commit -m "feat(hifz): a surah's state is derived from records and hearing ranges

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Queries for ranges

**Files:**
- Modify: `web/src/lib/hifz/hearing-queries.ts` (rewrite)

- [ ] **Step 1: Rewrite the module**

```ts
// web/src/lib/hifz/hearing-queries.ts
import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MISTAKE_COLS, type MistakeRow } from "./mistakes";
import type { HearingRange } from "./hearings";

export type Hearing = HearingRange & {
  id: string;
  submittedAt: string;
  note: string | null;
  teacherName: string;
  mistakes: MistakeRow[];   // of ONE surah when read through hearingsFor
};

type SessionRow = {
  id: string; reviewer_id: string; submitted_at: string | null;
  surah_number: number | null; to_surah_number: number | null; overall_note: string | null;
};

async function namesFor(reviewerIds: string[]): Promise<Map<string, string>> {
  if (!reviewerIds.length) return new Map();
  const { data } = await supabaseAdmin().from("profiles").select("id, full_name").in("id", reviewerIds);
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

const toHearing = (s: SessionRow, names: Map<string, string>, mistakes: MistakeRow[]): Hearing => ({
  id: s.id,
  from: s.surah_number!,
  to: s.to_surah_number!,
  submittedAt: s.submitted_at!,
  note: s.overall_note,
  teacherName: names.get(s.reviewer_id) ?? "your teacher",
  mistakes,
});

const HEARING_COLS = "id, reviewer_id, submitted_at, surah_number, to_surah_number, overall_note";

/**
 * Every submitted hearing of a student, newest first, WITHOUT mistakes —
 * what the grids need to draw heard-not-passed cells. Reads run as the
 * caller: a student sees only submitted rows; the teacher's name goes
 * through the admin client because profiles are not cross-readable.
 */
export async function hearingsForStudent(studentId: string): Promise<Hearing[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from("revision_sessions").select(HEARING_COLS)
    .eq("reciter_id", studentId).eq("kind", "hearing")
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false });
  const rows = (data ?? []) as SessionRow[];
  const names = await namesFor([...new Set(rows.map((r) => r.reviewer_id))]);
  return rows.map((r) => toHearing(r, names, []));
}

/** Every mistake of every submitted hearing of a student — the desk's heat. */
export async function hearingMistakesFor(studentId: string): Promise<MistakeRow[]> {
  const db = await supabaseServer();
  const { data: sessions } = await db
    .from("revision_sessions").select("id")
    .eq("reciter_id", studentId).eq("kind", "hearing").not("submitted_at", "is", null);
  const ids = (sessions ?? []).map((s) => s.id);
  if (!ids.length) return [];
  const { data } = await db.from("revision_mistakes").select(MISTAKE_COLS).in("session_id", ids);
  return (data ?? []) as MistakeRow[];
}

/**
 * Submitted hearings whose range covers one surah, newest first, each with
 * ITS mistakes on that surah only — a range hearing's marks on the
 * neighbouring surahs belong to those surahs' pages.
 */
export async function hearingsFor(studentId: string, surah: number): Promise<Hearing[]> {
  const db = await supabaseServer();
  const { data: sessions } = await db
    .from("revision_sessions").select(HEARING_COLS)
    .eq("reciter_id", studentId).eq("kind", "hearing")
    .gte("surah_number", surah).lte("to_surah_number", surah)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false });
  const rows = (sessions ?? []) as SessionRow[];
  if (!rows.length) return [];
  const ids = rows.map((s) => s.id);
  const [{ data: mistakes }, names] = await Promise.all([
    db.from("revision_mistakes").select(MISTAKE_COLS).in("session_id", ids).eq("surah_number", surah),
    namesFor([...new Set(rows.map((s) => s.reviewer_id))]),
  ]);
  const all = (mistakes ?? []) as MistakeRow[];
  return rows.map((s) => toHearing(s, names, all.filter((m) => m.session_id === s.id)));
}

/**
 * The teacher's open draft on this student, wherever it started, with its
 * marks. One open draft per teacher per student: the desk resumes it and
 * the per-surah page defers to it. `teacherId` must be the signed-in
 * teacher's own id (the page passes profile.id); RLS lets a teacher read
 * every session, so it will not catch a mismatch. If a race ever leaves
 * two open drafts, the oldest wins rather than crashing the page.
 */
export async function openDraftFor(
  teacherId: string, studentId: string,
): Promise<{ id: string; from: number; mistakes: MistakeRow[] } | null> {
  const db = await supabaseServer();
  const { data: s } = await db
    .from("revision_sessions").select("id, surah_number")
    .eq("reviewer_id", teacherId).eq("reciter_id", studentId).eq("kind", "hearing")
    .is("submitted_at", null)
    .order("started_at", { ascending: true }).limit(1).maybeSingle();
  if (!s || s.surah_number === null) return null;
  const { data } = await db.from("revision_mistakes").select(MISTAKE_COLS).eq("session_id", s.id);
  return { id: s.id, from: s.surah_number, mistakes: (data ?? []) as MistakeRow[] };
}
```

- [ ] **Step 2: Typecheck** — errors must now be confined to `hearing-actions.ts`, `review-logger.tsx`, the two surah pages (they still import `draftHearing` / `HearingOutcome`). Confirm.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hifz/hearing-queries.ts
git commit -m "feat(hifz): hearings are read by range; one open draft per student

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The Finish popup

**Files:**
- Create: `web/src/components/app/hearing-finish.tsx`
- Create: `web/src/components/app/hearing-finish.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// web/src/components/app/hearing-finish.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HearingFinish } from "./hearing-finish";

const names = {
  88: { en: "Al-Ghashiyah", ar: "الغاشية" },
  87: { en: "Al-A'la", ar: "الأعلى" },
  86: { en: "At-Tariq", ar: "الطارق" },
  85: { en: "Al-Buruj", ar: "البروج" },
};
const base = {
  open: true, onOpenChange: vi.fn(), from: 88, minEnd: 78, names,
  passedBefore: {} as Record<number, string>, pending: false,
};

afterEach(cleanup);

describe("HearingFinish", () => {
  it("lists the range as ticked rows and confirms them all", () => {
    const onConfirm = vi.fn();
    render(<HearingFinish {...base} initialEnd={86} onConfirm={onConfirm} />);
    expect(screen.getByText(/Al-Ghashiyah → At-Tariq · 3 surahs/)).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([true, true, true]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledWith({ to: 86, passed: [88, 87, 86], note: "" });
  });

  it("an unticked surah is left out of passed, with the note", () => {
    const onConfirm = vi.fn();
    render(<HearingFinish {...base} initialEnd={86} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByLabelText(/At-Tariq/));
    fireEvent.change(screen.getByPlaceholderText("Note for the student (optional)"), {
      target: { value: "madd in āyah 3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledWith({ to: 86, passed: [88, 87], note: "madd in āyah 3" });
  });

  it("names a surah that was passed before, so unticking it is a choice", () => {
    render(<HearingFinish {...base} initialEnd={87} passedBefore={{ 88: "2026-06-12" }} onConfirm={vi.fn()} />);
    expect(screen.getByText(/passed 12 Jun/)).toBeTruthy();
  });

  it("One more and One fewer move the end within the run", () => {
    const onConfirm = vi.fn();
    render(<HearingFinish {...base} initialEnd={87} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "One more" }));
    expect(screen.getAllByRole("checkbox").length).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: "One fewer" }));
    fireEvent.click(screen.getByRole("button", { name: "One fewer" }));
    expect(screen.getAllByRole("checkbox").length).toBe(1);
    expect((screen.getByRole("button", { name: "One fewer" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledWith({ to: 88, passed: [88], note: "" });
  });

  it("a surah widened into the range arrives ticked", () => {
    render(<HearingFinish {...base} initialEnd={88} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Al-Ghashiyah/));   // untick 88
    fireEvent.click(screen.getByRole("button", { name: "One more" }));
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([false, true]);
  });
});
```

- [ ] **Step 2: Run to see it fail** — cannot resolve `./hearing-finish`.

- [ ] **Step 3: Write the component**

```tsx
// web/src/components/app/hearing-finish.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rangeSurahs } from "@/lib/hifz/hearings";
import { fmtDay } from "@/lib/format";
import type { SurahNames } from "./mushaf-reader";

export type Verdict = { to: number; passed: number[]; note: string };

/**
 * The end of a hearing: the range as rows, a tick per surah, the note.
 * Confirm signs off the ticked surahs; an unticked one is heard and not
 * passed. A surah passed before says so on its row, because unticking it
 * revokes that pass. The end moves one surah at a time; a surah that
 * comes into the range arrives ticked, one that leaves takes its tick
 * with it.
 */
export function HearingFinish({
  open, onOpenChange, from, initialEnd, minEnd, names, passedBefore, pending, onConfirm, pages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  from: number;
  initialEnd: number;
  minEnd: number;                          // the last surah on the student's run
  names: SurahNames;
  passedBefore: Record<number, string>;   // surah → passed_at
  pending: boolean;
  onConfirm: (v: Verdict) => void;
  pages?: number;                          // pages the range spans, when known
}) {
  const [end, setEnd] = useState(initialEnd);
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const [note, setNote] = useState("");

  // A fresh open starts from the computed end with everything ticked.
  useEffect(() => {
    if (open) {
      setEnd(initialEnd);
      setUnticked(new Set());
    }
  }, [open, initialEnd]);

  const surahs = rangeSurahs(from, end);
  const toggle = (s: number) =>
    setUnticked((cur) => {
      const next = new Set(cur);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  const move = (delta: number) => {
    const next = end + delta;
    if (next > from || next < minEnd) return;
    // A surah leaving the range takes its tick with it; one arriving is ticked.
    setUnticked((cur) => new Set([...cur].filter((s) => s >= next && s <= from)));
    setEnd(next);
  };
  const name = (s: number) => names[s]?.en ?? String(s);
  const count = surahs.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm space-y-3">
        <DialogHeader>
          <DialogTitle>
            {count === 1
              ? name(from)
              : `${name(from)} → ${name(end)} · ${count} surahs${pages ? ` · ${pages} page${pages === 1 ? "" : "s"}` : ""}`}
          </DialogTitle>
        </DialogHeader>

        <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label="Surahs heard">
          {surahs.map((s) => (
            <li key={s}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!unticked.has(s)} onChange={() => toggle(s)} />
                <span>{name(s)}</span>
                {passedBefore[s] && (
                  <span className="text-xs text-muted-foreground">passed {fmtDay(passedBefore[s])}</span>
                )}
              </label>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={pending || end <= minEnd} onClick={() => move(-1)}>
            One more
          </Button>
          <Button size="sm" variant="outline" disabled={pending || end >= from} onClick={() => move(1)}>
            One fewer
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Ticked surahs are signed off. An unticked one stays heard and not passed, with its marks.
        </p>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Note for the student (optional)" rows={3} />
        <Button disabled={pending}
          onClick={() => onConfirm({ to: end, passed: surahs.filter((s) => !unticked.has(s)), note })}>
          {pending ? "Saving…" : "Confirm"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```
`SurahNames` is `Record<number, { ar: string; en: string }>` from `mushaf-reader.tsx` — check and match.

- [ ] **Step 4: Run the tests** → 5 passed. `npx eslint` on both files clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/app/hearing-finish.tsx src/components/app/hearing-finish.test.tsx
git commit -m "feat(hifz): the Finish popup — the range as rows, a tick per surah

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Actions and the logger finish through the popup; the per-surah page follows

**Files:**
- Modify: `web/src/lib/hifz/hearing-actions.ts` (rewrite)
- Modify: `web/src/components/app/review-logger.tsx`
- Modify: `web/src/components/app/review-logger.test.tsx`
- Modify: `web/src/app/teacher/hifz/[studentId]/[surah]/page.tsx`
- Modify: `web/src/app/(student)/hifz/[surah]/page.tsx`

- [ ] **Step 1: Rewrite the actions**

```ts
// web/src/lib/hifz/hearing-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireOwnStudent, requireTeacher } from "@/lib/teacher/guards";
import { rangeSurahs } from "./hearings";

/**
 * The teacher's open hearing on this student — wherever it started — or a
 * new one starting at `fromSurah`. Called on the FIRST TAP or at Finish,
 * never on opening a page. One open draft per teacher per student.
 */
export async function startHearing(studentId: string, fromSurah: number): Promise<string> {
  const me = await requireTeacher();
  await requireOwnStudent(studentId);
  const db = await supabaseServer();

  const { data: existing } = await db
    .from("revision_sessions").select("id")
    .eq("reviewer_id", me.id).eq("reciter_id", studentId).eq("kind", "hearing")
    .is("submitted_at", null)
    .order("started_at", { ascending: true }).limit(1).maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await db
    .from("revision_sessions")
    .insert({
      reviewer_id: me.id, reciter_id: studentId, kind: "hearing",
      surah_number: fromSurah, to_surah_number: fromSurah,
    })
    .select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export type HearingVerdict = { to: number; passed: number[]; note?: string };

/**
 * Finish. For every surah in [to, from]: ticked → the pass record is
 * upserted (comment = note, session_id = this hearing; passed_at untouched
 * on a re-pass); unticked → any record is deleted, which is what revokes an
 * earlier pass. Records first, then the session, so a failed record write
 * leaves the hearing open rather than a submitted hearing that lies.
 */
export async function submitHearing(sessionId: string, verdict: HearingVerdict): Promise<void> {
  const me = await requireTeacher();
  const db = await supabaseServer();

  const { data: s } = await db
    .from("revision_sessions").select("id, reciter_id, surah_number")
    .eq("id", sessionId).eq("reviewer_id", me.id).eq("kind", "hearing").is("submitted_at", null)
    .maybeSingle();
  if (!s || s.surah_number === null) throw new Error("Hearing already submitted or not yours.");
  await requireOwnStudent(s.reciter_id);

  const from = s.surah_number;
  const { to, passed } = verdict;
  if (!Number.isInteger(to) || to > from) throw new Error("The range ends before it starts.");
  const range = rangeSurahs(from, to);
  const ticked = new Set(passed);
  for (const p of ticked) if (!range.includes(p)) throw new Error("A ticked surah is outside the range.");
  const trimmed = verdict.note?.trim() || null;

  for (const surah of range) {
    if (ticked.has(surah)) {
      const { error } = await db.from("hifz_records").upsert(
        { student_id: s.reciter_id, surah_number: surah, teacher_comment: trimmed, marked_by: me.id, session_id: s.id },
        { onConflict: "student_id,surah_number" },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("hifz_records").delete()
        .eq("student_id", s.reciter_id).eq("surah_number", surah);
      if (error) throw new Error(error.message);
    }
  }

  const { error } = await db
    .from("revision_sessions")
    .update({ submitted_at: new Date().toISOString(), to_surah_number: to, overall_note: trimmed })
    .eq("id", s.id).is("submitted_at", null);
  if (error) throw new Error(error.message);

  revalidatePath("/hifz");
  revalidatePath("/teacher/hifz");
  revalidatePath("/teacher/hifz/hear");
  revalidatePath(`/teacher/hifz/${s.reciter_id}`);
  for (const surah of range) {
    revalidatePath(`/hifz/${surah}`);
    revalidatePath(`/teacher/hifz/${s.reciter_id}/${surah}`);
  }
}
```

- [ ] **Step 2: The logger** — in `review-logger.tsx`:

Imports: drop `HearingOutcome`; add `import { HearingFinish, type Verdict } from "./hearing-finish";` and `import { endSurahFor, lastSurahOn } from "@/lib/hifz/hearings";`.

Props: add to the non-session props
```ts
  /** Hearing mode only: the range's start, the run's last surah, and what
   *  the popup needs. `pageInView` is the page the teacher is looking at
   *  (the desk tracks it; the per-surah page leaves it undefined). */
  hearing?: {
    from: number;
    minEnd: number;
    names: SurahNames;
    passedBefore: Record<number, string>;
    pageInView?: number | null;
    onFinished?: (sessionId: string) => void;
  };
```
State: delete `verdict` and `confirmVerdict`; keep `wrapUp` for both modes (peer opens the flags dialog, hearing opens `HearingFinish`).

Header: the Finish button renders in BOTH modes (remove the `mode === "peer" &&` guard). Delete the whole `mode === "hearing" && (<div className="glass sticky bottom-2 …verdict bar…>)` block. Delete the verdict `<Dialog>`.

Add, before the return:
```ts
  const markSurahs = Object.keys(marks).map((k) => Number(k.split(":")[0]));
  const initialEnd = hearing
    ? endSurahFor(hearing.from, hearing.pageInView == null ? null : lastSurahOn(pages, hearing.pageInView), markSurahs)
    : 0;
  const finishHearing = (v: Verdict) =>
    startTransition(() =>
      withSession(async (id) => {
        await submitHearing(id, v);
        setWrapUp(false);
        router.refresh();
        hearing?.onFinished?.(id);
      }),
    );
```
(`markKey` produces `"surah:ayah"` or `"surah:ayah:position"`, so the surah is always the first segment.)

Render, replacing the peer wrap-up `<Dialog>`:
```tsx
      {mode === "hearing" && hearing ? (
        <HearingFinish
          open={wrapUp}
          onOpenChange={setWrapUp}
          from={hearing.from}
          initialEnd={initialEnd}
          minEnd={hearing.minEnd}
          names={hearing.names}
          passedBefore={hearing.passedBefore}
          pending={pending}
          onConfirm={finishHearing}
        />
      ) : (
        <Dialog open={wrapUp} onOpenChange={setWrapUp}>
          {/* the existing peer wrap-up content, unchanged */}
        </Dialog>
      )}
```
Update the doc comment's hearing paragraph: "Finish opens the range popup: a tick per surah, a note; confirm signs off the ticked ones."

- [ ] **Step 3: Logger tests** — in `review-logger.test.tsx`, the hearing `describe`: mock stays `submitHearing: vi.fn(async () => {})`. Add a shared `hearing` prop object:
```ts
  const hearing = { from: 114, minEnd: 78, names: { 114: { en: "An-Nas", ar: "الناس" } }, passedBefore: {} };
```
Rewrite the three verdict tests as:
```tsx
  it("finishes through the range popup, creating the draft if needed", async () => {
    const ensureSession = ensure();
    render(<ReviewLogger mode="hearing" sessionId={null} ensureSession={ensureSession}
      reciterName="Aisha" pages={pages} initialMistakes={[]} hearing={hearing} />);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.change(screen.getByPlaceholderText("Note for the student (optional)"), {
      target: { value: "cleaner than last week" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(submitHearing).toHaveBeenCalledWith("h1", { to: 114, passed: [114], note: "cleaner than last week" }));
    expect(ensureSession).toHaveBeenCalledTimes(1);
  }, SLOW);

  it("an unticked surah is not passed, on an existing draft", async () => {
    render(<ReviewLogger mode="hearing" sessionId="draft-9" ensureSession={ensure()}
      reciterName="Aisha" pages={pages} initialMistakes={[]} hearing={hearing} />);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.click(screen.getByLabelText(/An-Nas/));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(submitHearing).toHaveBeenCalledWith("draft-9", { to: 114, passed: [], note: "" }));
  }, SLOW);
```
Delete the old Passed / Not passed / abandoned-note tests (the popup owns its note now and resets on open). Keep "creates the draft on the first tap" (add `hearing={hearing}`) and "shows earlier marks" (add `hearing={hearing}`). The header test `queryByRole("button", { name: "Finish" })).toBeNull()` must flip to `.not.toBeNull()`.

- [ ] **Step 4: The per-surah teacher page** (`[studentId]/[surah]/page.tsx`)

Imports: `openDraftFor, hearingsFor, hearingsForStudent` from hearing-queries (drop `draftHearing`); `recordLine, summaryOf, surahState` from hearings; `Link` is already imported.

In the `Promise.all`, replace `draftHearing(profile.id, studentId, number)` with `openDraftFor(profile.id, studentId)` and add `hearingsForStudent(studentId)` (bind to `allHearings`); also select `session_id` is not needed. Also load the student's passed set: extend the `hifz_records` read to ALL of the student's records: `db.from("hifz_records").select("surah_number, passed_at, teacher_comment").eq("student_id", studentId)` bound to `records`, then:
```ts
  const record = records?.find((r) => r.surah_number === number) ?? null;
  const passedSet = new Set((records ?? []).map((r) => r.surah_number));
  const passedBefore: Record<number, string> = Object.fromEntries((records ?? []).map((r) => [r.surah_number, r.passed_at]));
  const state = surahState(number, passedSet, allHearings);
  const latest = hearings[0] ?? null;
  const line = recordLine(state, record ? { passedAt: record.passed_at, comment: record.teacher_comment } : null, summaryOf(latest));
  const minEnd = list[list.length - 1].number;
```
Session props: `draft` is now the open draft for the student regardless of surah. If `draft && draft.from !== number`, render instead of the logger:
```tsx
        <section className="box c12">
          <p className="note">
            A hearing is in progress from {surahs.find((s) => s.number === draft.from)?.name_en ?? draft.from}.{" "}
            <Link href={`/teacher/hifz/hear?student=${studentId}`} className="underline">Continue it at the desk</Link>.
          </p>
        </section>
```
Otherwise the logger as now, with the new prop:
```tsx
            hearing={{ from: number, minEnd, names: surahNames, passedBefore }}
```
and `initialMistakes={draft?.mistakes ?? []}` only when `draft.from === number`. The `Rule` label stays. Remove the "Last time" line's dependence on outcome (it reads `latest?.note`, unchanged). The `RecordActions` section shows when `record` exists (unchanged).

- [ ] **Step 5: The student surah page** (`(student)/hifz/[surah]/page.tsx`)

Add `hearingsForStudent(profile.id)` to the `Promise.all` (bind `allHearings`) and read ALL records for the student instead of the one row:
`db.from("hifz_records").select("surah_number, passed_at, teacher_comment").eq("student_id", profile.id)` → `records`; then `record = records.find(surah)`, `passedSet`, `state = surahState(number, passedSet, allHearings)`, `line = recordLine(state, …, summaryOf(latest))`, and `commentToShow(state, record…, latest ? { note: latest.note, submittedAt: latest.submittedAt } : null)`. The stat block's "Passed" / "Not yet" becomes: `state === "passed" ? "Passed" : state === "not_passed" ? "Not passed" : "Not yet"`, with the "Not passed" stat in `text-danger`.

- [ ] **Step 6: Verify** — `npx vitest run src/components/app/review-logger.test.tsx src/components/app/hearing-finish.test.tsx src/lib/hifz/hearings.test.ts`; `npx tsc --noEmit -p .` must now be CLEAN (every consumer of `outcome`/`draftHearing`/`HearingOutcome` is gone: grep to confirm); `npm test`; `npx eslint` on the five files.

- [ ] **Step 7: Commit**

```bash
git add src/lib/hifz/hearing-actions.ts src/components/app/review-logger.tsx src/components/app/review-logger.test.tsx "src/app/teacher/hifz/[studentId]/[surah]/page.tsx" "src/app/(student)/hifz/[surah]/page.tsx"
git commit -m "feat(hifz): one Finish — the range popup signs off the ticked surahs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The whole mushaf, the page in view

**Files:**
- Modify: `web/src/lib/reference/cached.ts` (append)
- Modify: `web/src/components/app/mushaf-reader.tsx` (page ids)
- Create: `web/src/components/app/use-page-in-view.ts`
- Modify: `web/src/components/app/review-logger.tsx` (scroll to start, track the page)

- [ ] **Step 1: All pages, cached**

Append to `cached.ts`:
```ts
/** Every seeded word, in reading order — the desk renders the whole mushaf.
 *  Surah order is page order here (Al-Mulk on 562 up to An-Nas on 604). */
export const getCachedAllPageWords = unstable_cache(
  async () => {
    const { data, error } = await supabaseAdmin()
      .from("quran_words")
      .select("surah_number, ayah_number, word_position, text_uthmani, code_v1, code_v2, is_end, page_number, line_number")
      .order("page_number").order("line_number").order("surah_number").order("ayah_number").order("word_position");
    if (error) throw error;
    return data ?? [];
  },
  ["ref-all-page-words-v1"],
  { tags: ["reference"], revalidate: 3600 },
);
```
Ordering by page then line then surah/ayah/position reproduces printed order; `groupIntoPages` groups consecutive page/line values. If the query is refused for size (PostgREST caps rows at 1000 by default), page through it with `.range(i, i + 999)` in a loop until fewer than 1000 rows come back, concatenating — say in the report which path you took.

- [ ] **Step 2: Page ids** — in `mushaf-reader.tsx`, on the per-page `<section key={p.page} …>` add `id={`page-${p.page}`}`.

- [ ] **Step 3: The hook**

```ts
// web/src/components/app/use-page-in-view.ts
"use client";

import { useEffect, useState } from "react";

/**
 * Which printed page the reader is looking at: the `page-N` section with
 * the most of itself on screen. Null until the observer reports, and
 * always null where IntersectionObserver does not exist (tests).
 */
export function usePageInView(pageNumbers: readonly number[]): number | null {
  const [page, setPage] = useState<number | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const ratios = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).id.replace("page-", ""));
          ratios.set(n, e.intersectionRatio);
        }
        let best: number | null = null;
        let bestRatio = 0;
        for (const [n, r] of ratios) if (r > bestRatio) { best = n; bestRatio = r; }
        if (best !== null) setPage(best);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const n of pageNumbers) {
      const el = document.getElementById(`page-${n}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [pageNumbers]);
  return page;
}
```

- [ ] **Step 4: Wire the logger** — `hearing` prop gains `startPage?: number` and the internal `pageInView` comes from the hook when `hearing` is set and no `pager` is given:
```ts
  const pageNumbers = useMemo(() => pages.map((p) => p.page), [pages]);
  const observed = usePageInView(pageNumbers);
  const pageInView = hearing?.pageInView ?? (pager ? null : observed);
  useEffect(() => {
    if (!hearing?.startPage) return;
    document.getElementById(`page-${hearing.startPage}`)?.scrollIntoView({ block: "start" });
  }, [hearing?.startPage]);
```
and `initialEnd` uses `pageInView`. Remove `pageInView` from the `hearing` prop type if you made it internal; keep whichever is simpler, but the desk must not have to pass it. Import `useEffect, useMemo`.

- [ ] **Step 5: Verify** — `npx tsc --noEmit -p .`; `npm test` (the hook is a no-op in jsdom); `npx eslint` on the four files.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reference/cached.ts src/components/app/mushaf-reader.tsx src/components/app/use-page-in-view.ts src/components/app/review-logger.tsx
git commit -m "feat(hifz): the logger can hold the whole mushaf and knows the page in view

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The desk

**Files:**
- Create: `web/src/app/teacher/hifz/hear/page.tsx`
- Create: `web/src/components/app/hearing-desk.tsx`
- Create: `web/src/components/app/hearing-desk.test.tsx`
- Modify: `web/src/components/app/hifz-tabs.tsx`
- Modify: `web/src/app/teacher/hifz/page.tsx` (one link)
- Modify: `web/src/app/teacher/hifz/[studentId]/page.tsx` (pass `hearHref`)

- [ ] **Step 1: Failing test for the desk shell**

```tsx
// web/src/components/app/hearing-desk.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HearingDesk } from "./hearing-desk";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const roster = [
  { id: "s1", name: "Aisha", nextSurah: 88, nextName: "Al-Ghashiyah" },
  { id: "s2", name: "Bilal", nextSurah: 92, nextName: "Al-Layl" },
  { id: "s3", name: "Dawud", nextSurah: null, nextName: null },
];

afterEach(() => { cleanup(); push.mockClear(); });

describe("HearingDesk", () => {
  it("changes student through the URL", () => {
    render(<HearingDesk roster={roster} studentId="s1" from={88} draftStarted={false} run={[]} done={null}>
      <div>mushaf</div>
    </HearingDesk>);
    fireEvent.change(screen.getByLabelText("Student"), { target: { value: "s2" } });
    expect(push).toHaveBeenCalledWith("/teacher/hifz/hear?student=s2");
  });
  it("lets the start change until the draft has marks", () => {
    const run = [{ number: 88, name_en: "Al-Ghashiyah" }, { number: 87, name_en: "Al-A'la" }];
    const { rerender } = render(<HearingDesk roster={roster} studentId="s1" from={88} draftStarted={false} run={run} done={null}><div /></HearingDesk>);
    fireEvent.change(screen.getByLabelText("Starting at"), { target: { value: "87" } });
    expect(push).toHaveBeenCalledWith("/teacher/hifz/hear?student=s1&from=87");
    rerender(<HearingDesk roster={roster} studentId="s1" from={88} draftStarted={true} run={run} done={null}><div /></HearingDesk>);
    expect((screen.getByLabelText("Starting at") as HTMLSelectElement).disabled).toBe(true);
  });
  it("offers the next student after a hearing", () => {
    render(<HearingDesk roster={roster} studentId="s1" from={88} draftStarted={false} run={[]}
      done={{ text: "Heard Al-Ghashiyah → Al-A'la · 2 passed · 0 not passed" }}><div /></HearingDesk>);
    expect(screen.getByText(/2 passed/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Next student/ }).getAttribute("href")).toBe("/teacher/hifz/hear?student=s2");
  });
});
```

- [ ] **Step 2: The shell**

```tsx
// web/src/components/app/hearing-desk.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export type DeskStudent = { id: string; name: string; nextSurah: number | null; nextName: string | null };

/**
 * The desk's chrome around the logger: who is reciting, where they start,
 * and — once a hearing is confirmed — what was heard and who is next. The
 * logger itself is passed in as children so this shell holds no mushaf
 * state of its own. Student and start live in the URL, so a reload lands
 * back on the same student.
 */
export function HearingDesk({
  roster, studentId, from, draftStarted, run, done, children,
}: {
  roster: DeskStudent[];
  studentId: string;
  from: number;
  draftStarted: boolean;                       // marks exist: the start is fixed
  run: { number: number; name_en: string }[];   // the student's run, for the start picker
  done: { text: string } | null;               // the line after a confirmed hearing
  children: React.ReactNode;
}) {
  const router = useRouter();
  const idx = roster.findIndex((s) => s.id === studentId);
  const next = roster.slice(idx + 1).find((s) => s.nextSurah !== null) ?? null;

  return (
    <div className="space-y-3">
      <div className="glass sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-xl px-4 py-2.5">
        <label className="flex items-center gap-2 text-sm">
          <span className="label">Student</span>
          <select
            aria-label="Student"
            className="rounded-md border border-line bg-background px-2 py-1 text-sm"
            value={studentId}
            onChange={(e) => router.push(`/teacher/hifz/hear?student=${e.target.value}`)}
          >
            {roster.map((s) => (
              <option key={s.id} value={s.id} disabled={s.nextSurah === null}>
                {s.name}{s.nextName ? ` · ${s.nextName}` : " · no target set"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="label">Starting at</span>
          <select
            aria-label="Starting at"
            className="rounded-md border border-line bg-background px-2 py-1 text-sm disabled:opacity-60"
            value={from}
            disabled={draftStarted}
            title={draftStarted ? "The start is fixed once a mark is logged" : undefined}
            onChange={(e) => router.push(`/teacher/hifz/hear?student=${studentId}&from=${e.target.value}`)}
          >
            {run.map((s) => <option key={s.number} value={s.number}>{s.name_en}</option>)}
          </select>
        </label>
      </div>

      {done && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm">
          <span>{done.text}</span>
          {next && (
            <Link href={`/teacher/hifz/hear?student=${next.id}`} className="underline">
              Next student · {next.name} →
            </Link>
          )}
        </div>
      )}

      {children}
    </div>
  );
}
```

- [ ] **Step 3: The page**

```tsx
// web/src/app/teacher/hifz/hear/page.tsx
import { notFound } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getCachedAllPageWords, getCachedSurahs, getCachedSurahStartPages } from "@/lib/reference/cached";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import { memorisationList, type Surah } from "@/lib/hifz/pace";
import { hearingMistakesFor, hearingsForStudent, openDraftFor } from "@/lib/hifz/hearing-queries";
import { rangeSurahs } from "@/lib/hifz/hearings";
import { startHearing } from "@/lib/hifz/hearing-actions";
import { spreadHeat } from "@/lib/hifz/heat-spread";
import { teacherRoster } from "@/lib/teacher/scope";
import { HearingDesk, type DeskStudent } from "@/components/app/hearing-desk";
import { ReviewLogger, type SessionProps } from "@/components/app/review-logger";
import type { SurahNames } from "@/components/app/mushaf-reader";
import type { MistakeRow } from "@/lib/hifz/mistakes";

export const dynamic = "force-dynamic";

/**
 * The hearing desk: the Thursday lesson from one page. Pick the student,
 * the whole mushaf opens at their next surah, tap as they recite, Finish
 * once. The URL carries the student and, until the first mark, the start.
 */
export default async function HearingDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; from?: string; done?: string }>;
}) {
  const { student: studentParam, from: fromParam, done: doneParam } = await searchParams;
  const profile = (await currentProfile())!;
  const db = await supabaseServer();

  const [students, surahs] = await Promise.all([teacherRoster(), getCachedSurahs()]);
  const ids = students.map((s) => s.id);
  const { data: progress } = ids.length
    ? await db.from("v_hifz_progress").select("student_id, passed, target_count, start_surah").in("student_id", ids)
    : { data: [] as { student_id: string | null; passed: number | null; target_count: number | null; start_surah: number | null }[] };
  const byStudent = new Map((progress ?? []).map((p) => [p.student_id!, p]));

  const all = surahs as Surah[];
  const runOf = (id: string) => {
    const p = byStudent.get(id);
    return p ? memorisationList(Number(p.start_surah ?? 114), Number(p.target_count), all) : [];
  };
  const roster: DeskStudent[] = students.map((s) => {
    const p = byStudent.get(s.id);
    const next = p ? runOf(s.id)[Number(p.passed)] : undefined;
    return { id: s.id, name: s.full_name, nextSurah: next?.number ?? null, nextName: next?.name_en ?? null };
  });

  const chosen = roster.find((s) => s.id === studentParam) ?? roster.find((s) => s.nextSurah !== null);
  if (!chosen) notFound();
  const studentId = chosen.id;
  const run = runOf(studentId);
  if (!run.length) notFound();

  const [draft, allHearings, hearingMistakes, { data: records }, rows, startPages] = await Promise.all([
    openDraftFor(profile.id, studentId),
    hearingsForStudent(studentId),
    hearingMistakesFor(studentId),
    db.from("hifz_records").select("surah_number, passed_at").eq("student_id", studentId),
    getCachedAllPageWords(),
    getCachedSurahStartPages(),
  ]);

  // The start: the open draft's, else ?from if it is on the run, else the next surah.
  const requested = Number(fromParam);
  const from = draft?.from
    ?? (run.some((s) => s.number === requested) ? requested : chosen.nextSurah!);
  const minEnd = run[run.length - 1].number;

  const words = rows.map(fromRow);
  const pages = groupIntoPages(words);
  const { heat, history } = spreadHeat(words, hearingMistakes, new Date());
  const surahNames: SurahNames = Object.fromEntries(surahs.map((s) => [s.number, { ar: s.name_ar, en: s.name_en }]));
  const passedBefore: Record<number, string> = Object.fromEntries((records ?? []).map((r) => [r.surah_number, r.passed_at]));

  // The line after Confirm: the hearing named in ?done, described from what it wrote.
  const justDone = doneParam ? allHearings.find((h) => h.id === doneParam) : undefined;
  const done = justDone
    ? (() => {
        const range = rangeSurahs(justDone.from, justDone.to);
        const passed = range.filter((n) => passedBefore[n] !== undefined).length;
        const name = (n: number) => surahNames[n]?.en ?? String(n);
        const span = range.length === 1 ? name(justDone.from) : `${name(justDone.from)} → ${name(justDone.to)}`;
        return { text: `Heard ${span} · ${passed} passed · ${range.length - passed} not passed` };
      })()
    : null;

  const session: SessionProps & { initialMistakes: MistakeRow[] } = draft
    ? { sessionId: draft.id, initialMistakes: draft.mistakes }
    : { sessionId: null, ensureSession: startHearing.bind(null, studentId, from), initialMistakes: [] };

  return (
    <>
      <header className="masthead">
        <h1><span>Hear</span></h1>
        <p>The lesson, from one page: pick the student, tap as they recite, finish once.</p>
      </header>
      <HearingDesk
        roster={roster}
        studentId={studentId}
        from={from}
        draftStarted={Boolean(draft && draft.mistakes.length)}
        run={run.map((s) => ({ number: s.number, name_en: s.name_en }))}
        done={done}
      >
        <ReviewLogger
          mode="hearing"
          {...session}
          reciterName={chosen.name}
          pages={pages}
          heat={heat}
          history={history}
          surahNames={surahNames}
          hearing={{ from, minEnd, names: surahNames, passedBefore, startPage: startPages[from] }}
        />
      </HearingDesk>
    </>
  );
}
```
The `onFinished` hook: the desk needs the `?done=` param set after Confirm. Since `HearingDeskPage` is a server component, pass the navigation through the logger prop from a small client wrapper — simplest: in `hearing-desk.tsx` export a second tiny client component `DeskLogger` that renders `ReviewLogger` and supplies `onFinished: (id) => router.push(`/teacher/hifz/hear?student=${studentId}&done=${id}`)`. Move the `<ReviewLogger …/>` above into that wrapper, passing the same props plus `studentId`. Keep `HearingDesk` and `DeskLogger` in the same file.

- [ ] **Step 4: The tab and the link** — `hifz-tabs.tsx`: add an optional prop `hearHref?: string`; when set, render a third `<Link href={hearHref} className={cls("hear")}>Hear</Link>` and widen `active` to `"overview" | "review" | "hear"`. Teacher student page: `<HifzTabs basePath=… active=… hearHref={`/teacher/hifz/hear?student=${studentId}`} />`. Register page (`teacher/hifz/page.tsx`): in the masthead `<p>`, append ` ` and `<Link href="/teacher/hifz/hear" className="underline">Hear a student</Link>` (import Link).

- [ ] **Step 5: Verify** — `npx vitest run src/components/app/hearing-desk.test.tsx` (3 passed); `npx tsc --noEmit -p .`; `npm test`; `npx eslint` on the touched files; `npm run build` must list `/teacher/hifz/hear` (a static segment beats `[studentId]`; confirm the route resolves to the desk by the build output, and that `[studentId]/page.tsx` still exists).

- [ ] **Step 6: Commit**

```bash
git add src/app/teacher/hifz/hear/page.tsx src/components/app/hearing-desk.tsx src/components/app/hearing-desk.test.tsx src/components/app/hifz-tabs.tsx src/app/teacher/hifz/page.tsx "src/app/teacher/hifz/[studentId]/page.tsx"
git commit -m "feat(hifz): the hearing desk — the whole mushaf, from the student's next surah

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Heard, not passed — the red cell

**Files:**
- Modify: `web/src/components/app/hifz-journey.tsx`, `hifz-journey.test.tsx`
- Modify: `web/src/components/app/hifz-grid.tsx`, `hifz-grid.test.tsx`
- Modify: `web/src/app/globals.css` (after `.cell.done`)
- Modify: `web/src/app/(student)/hifz/page.tsx`, `web/src/app/teacher/hifz/[studentId]/page.tsx`

- [ ] **Step 1: Failing tests** — journey: add a test "draws a heard surah that was not passed as redo": render with `heard={new Set([113])}` and records not containing 113; expect the cell for 113 to have class `redo` and its sr-only text to contain "heard, not passed"; and a passed surah in `heard` is `done`, not `redo`. Grid: `MarkRow` gains `heard: boolean`; test that `{ passed: false, heard: true }` renders `.cell.redo` and `{ passed: true, heard: true }` renders `.cell.done` only. Read each test file first and follow its fixture helpers (`run(...)` in the grid test; whatever the journey test uses).

- [ ] **Step 2: Journey** — prop `heard?: ReadonlySet<number>` (default empty). `isRedo = (item) => !isDone(item) && heard.has(item.s.number)`. Cell class: `cn("cell", isDone(item) && "done", isRedo(item) && "redo", isNext && "next")`. In the sr-only span add `{isRedo(item) && ", heard, not passed"}`. Doc comment: one sentence on the third state.

- [ ] **Step 3: Grid** — `MarkRow.heard: boolean`; class `cn("cell", r.passed && "done", !r.passed && r.heard && "redo", …)`; sr-only `{!r.passed && r.heard && ", heard, not passed"}`.

- [ ] **Step 4: CSS** — after the `.cell.done …` rules in `globals.css`:
```css
  /* Heard and not passed: the third state. Red, like a mark, because that is
     what it is — the student knows exactly which surah to bring back. */
  .cell.redo { background: color-mix(in oklab, var(--danger) 12%, var(--card)); }
  .cell.redo:hover { background: color-mix(in oklab, var(--danger) 22%, var(--card)); }
  .cell.redo .ar-quran { color: var(--danger); }
```

- [ ] **Step 5: Pages** — student overview `(student)/hifz/page.tsx`: add `hearingsForStudent(profile.id)` to its `Promise.all`; `const heard = new Set(hearings.flatMap((h) => rangeSurahs(h.from, h.to)))`; pass `heard={heard}` to `HifzJourney`. Teacher student page: same read; when building `rows`, `heard: heardSet.has(s.number)`.

- [ ] **Step 6: Verify** — the two test files; tsc; `npm test`; eslint.

- [ ] **Step 7: Commit**

```bash
git add src/components/app/hifz-journey.tsx src/components/app/hifz-journey.test.tsx src/components/app/hifz-grid.tsx src/components/app/hifz-grid.test.tsx src/app/globals.css "src/app/(student)/hifz/page.tsx" "src/app/teacher/hifz/[studentId]/page.tsx"
git commit -m "feat(hifz): a surah heard and not passed shows red on both sides

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The live check, the whole, the spec

**Files:**
- Modify: `web/supabase/checks/hearings_rls.sql`
- Modify: `docs/superpowers/specs/2026-09-16-range-hearings-design.md` (only if something built differs)

- [ ] **Step 1: The check** — in `hearings_rls.sql`: the hearing insert gains `to_surah_number`: `insert into revision_sessions (reviewer_id, reciter_id, kind, surah_number, to_surah_number) values (teacher, student, 'hearing', 114, 113)`; the student's hearing-insert negative case likewise adds `to_surah_number` = 114; the submit update becomes `update revision_sessions set submitted_at = now() where id = sid;` (no outcome). Run it as in the previous plan (substitute ids into a `/tmp` copy, `--probe`, confirm `hearings rls ok`, confirm no leftover row, delete the copy).

- [ ] **Step 2: Full checks** — from `web/`: `npx tsc --noEmit -p . ; npm test ; npm run build`. Report counts and the route list entries for `/teacher/hifz/hear`, `/teacher/hifz/[studentId]/[surah]`.

- [ ] **Step 3: Reconcile the spec** — read the spec against what exists; fix any sentence that no longer matches (file names, prop names). Note in "Testing" that the hook is inert in jsdom and the page-in-view behaviour is verified by hand.

- [ ] **Step 4: Commit**

```bash
git add supabase/checks/hearings_rls.sql
git commit -m "test(hifz): the live RLS check knows a hearing has an end

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
# and from the repo root, if the spec changed:
git add docs/superpowers/specs/2026-09-16-range-hearings-design.md
git commit -m "docs(hifz): the range-hearing spec matches what was built

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: Report** what was verified by test and by build, and the manual walk-through left for a human: hear three surahs at the desk, untick the third, confirm; the student sees two green and one red with its marks and the note; re-hear the red one from its surah page and pass it; the register and journey update.
