# Teacher Class Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-student list to the teacher dashboard showing each student's last-passed surah, their pace against target, and their homework average for the current term.

**Architecture:** Three units. A pure logic file (`lib/teacher/class-progress.ts`) owns the row shape, the last-passed-surah rule, and the three orderings — no database, fully unit-tested. A server query (`getClassProgress` in `lib/dashboard/queries.ts`) assembles rows from existing views. A client component (`components/app/class-progress.tsx`) holds the sort dropdown state and reorders in the browser. `/teacher/home` renders it. Spec: `docs/superpowers/specs/2026-08-11-teacher-class-progress-design.md`.

**Tech Stack:** Next.js 15 App Router (React Server Components), TypeScript, Supabase (postgres views, `security_invoker`), Tailwind, vitest + @testing-library/react.

---

## Background the engineer needs

**The domain.** BSMS students memorise (hifz) the Qur'an backwards from An-Nas (surah 114) toward Al-Jinn (surah 72). The `surahs` table has an `order_index` column where `1 = An-Nas` and `43 = Al-Jinn`. Each student has a row in `hifz_profiles` with a `start_surah` (default 114) and a `target_count` for the year. Returning students who pass a hifz check start partway down the run, so **their `start_surah` is not 114** — this is the single most common source of bugs in this area.

A student has "passed" a surah when a row exists in `hifz_records` for `(student_id, surah_number)`. There is no boolean; presence is the pass.

**Existing helpers you must reuse, not reimplement** — all in `web/src/lib/hifz/pace.ts`, all already unit-tested in `pace.test.ts`:

- `expectedPassed(now, weeks, targetCount)` — how many surahs a student should have passed by now, derived from the teaching calendar and rounded **up**. Terms are not equal length, so dividing the year by three would be wrong.
- `paceStatus(passed, expected)` — returns `"ok"` (ahead), `"warn"` (exactly on), `"danger"` (behind).
- `memorisationList(startSurah, targetCount, surahs)` — the student's own ordered run of surahs. **This is how you respect `start_surah`.**
- `type Surah = { number, order_index, name_ar, name_en }`
- `type PaceStatus = "ok" | "warn" | "danger"`

**Database nullability gotcha.** Supabase generates types from the schema. Table columns are typed accurately (`hifz_records.student_id` is `string`, `profiles.full_name` is `string`), but **every column of every view is typed `| null`** — `v_hifz_progress.passed`, `v_termly_avg.hw_avg`, `student_id`, all of them. You must coerce with `Number()` and filter out null keys before building a `Map`. `getFullProgress` in `lib/dashboard/queries.ts` shows the house pattern for this.

**Project rule.** The comment at the top of `lib/dashboard/queries.ts` states: *every grade number comes from a view — the verified formulas live in SQL and are never recomputed in JS.* Do not compute a percentage in TypeScript. Taking a mean of numbers that came from a view is fine and is already done.

**Running tests.** From `web/`:
- One file: `npx vitest run src/lib/teacher/class-progress.test.ts`
- One test: `npx vitest run src/lib/teacher/class-progress.test.ts -t "name of test"`
- Everything: `npm test`
- Typecheck: `npx tsc --noEmit`
- Lint: `npm run lint`

`vitest.config.ts` sets `environment: "jsdom"` globally and picks up `src/**/*.test.{ts,tsx}`. `@` aliases to `src`.

**Do not push to `main`.** Netlify auto-deploys every push to `main` straight to production with no gate. Work stays on the current branch.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `web/src/lib/teacher/class-progress.ts` | Create | `ClassRow` type, `lastPassedSurah`, `sortClassRows`, `CLASS_SORTS`. Pure — no imports from supabase, no React. |
| `web/src/lib/teacher/class-progress.test.ts` | Create | Unit tests for the above. |
| `web/src/lib/dashboard/queries.ts` | Modify | Add `getClassProgress`. Appended at the end of the file. |
| `web/src/components/app/class-progress.tsx` | Create | Client component: sort dropdown + row list + footnote. |
| `web/src/components/app/class-progress.test.tsx` | Create | Component test: renders rows, dropdown reorders. |
| `web/src/app/teacher/home/page.tsx` | Modify | Render the section; derive two of the three tiles from the same rows. |
| `web/src/app/teacher/hifz/page.tsx` | Modify | Fix next-surah to respect `start_surah`. |

Splitting pure logic from the query and the component is what the codebase already does for the equivalent student-side feature (`lib/homework/sort.ts` + `components/app/marked-homework.tsx`). Follow it.

---

### Task 1: `lastPassedSurah`

Which surah a student is on. Defined as the **furthest-along** surah in their own run that carries a record — deliberately not the most recently dated one. Sign-offs can land out of order, and furthest-along is the definition that stays consistent with the `passed/target` count rendered in the same row.

**Files:**
- Create: `web/src/lib/teacher/class-progress.ts`
- Test: `web/src/lib/teacher/class-progress.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/teacher/class-progress.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Surah } from "@/lib/hifz/pace";
import { lastPassedSurah } from "./class-progress";

/** The real run: order_index 1 = An-Nas (114) … 43 = Al-Jinn (72). */
const surahs: Surah[] = Array.from({ length: 43 }, (_, i) => ({
  number: 114 - i,
  order_index: i + 1,
  name_ar: `س${i + 1}`,
  name_en: `S${i + 1}`,
}));

describe("lastPassedSurah", () => {
  it("returns null when nothing is passed", () => {
    expect(lastPassedSurah(114, 43, surahs, new Set())).toBeNull();
  });

  it("returns the furthest-along record, not the first one found", () => {
    // Passed An-Nas (114), Al-Falaq (113), Al-Ikhlas (112) — three in.
    const passed = new Set([114, 113, 112]);
    expect(lastPassedSurah(114, 43, surahs, passed)!.number).toBe(112);
  });

  it("is furthest-along even when sign-offs land out of order", () => {
    // 111 was signed off before 113 ever was; 111 is still deeper into the run.
    const passed = new Set([114, 111]);
    expect(lastPassedSurah(114, 43, surahs, passed)!.number).toBe(111);
  });

  it("is correct for a returning student who does not start at An-Nas", () => {
    // start_surah 100, target 10 → their run is 100, 99, 98 … 91.
    const passed = new Set([100, 99, 98]);
    expect(lastPassedSurah(100, 10, surahs, passed)!.number).toBe(98);
  });

  it("ignores records outside the student's own run", () => {
    // 114 is above a returning student's start point — last year's work.
    const passed = new Set([114, 113, 100]);
    expect(lastPassedSurah(100, 10, surahs, passed)!.number).toBe(100);
  });

  it("returns the final surah once the whole target is passed", () => {
    const passed = new Set([114, 113, 112]);
    expect(lastPassedSurah(114, 3, surahs, passed)!.number).toBe(112);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/teacher/class-progress.test.ts`
Expected: FAIL — `Failed to resolve import "./class-progress"`.

- [ ] **Step 3: Write the minimal implementation**

Create `web/src/lib/teacher/class-progress.ts`:

```ts
/**
 * The teacher dashboard's per-student class list — pure logic.
 *
 * Modelled on lib/homework/sort.ts: the shaping and ordering rules live here,
 * with no database and no React, so they can be tested without either.
 */

import { memorisationList, type Surah } from "@/lib/hifz/pace";

/**
 * The surah a student is on: the FURTHEST-ALONG surah in their own run that
 * carries a record.
 *
 * Not the most recently dated one. Sign-offs can land out of order, and
 * furthest-along is the definition that stays consistent with the
 * `passed/target` count rendered beside it — a row reading "Al-Fajr" next to a
 * count of 12 would be a contradiction the teacher cannot resolve.
 *
 * Scoped to `memorisationList`, so a returning student whose `start_surah`
 * isn't 114 is never credited with (or judged against) last year's surahs.
 */
export function lastPassedSurah(
  startSurah: number,
  target: number,
  surahs: Surah[],
  passedNumbers: Set<number>,
): Surah | null {
  const list = memorisationList(startSurah, target, surahs);
  for (let i = list.length - 1; i >= 0; i--) {
    if (passedNumbers.has(list[i].number)) return list[i];
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/teacher/class-progress.test.ts`
Expected: PASS — 6 tests in `lastPassedSurah`.

- [ ] **Step 5: Commit**

```bash
cd web
git add src/lib/teacher/class-progress.ts src/lib/teacher/class-progress.test.ts
git commit -m "feat(teacher): last-passed surah, scoped to the student's own run"
```

---

### Task 2: `ClassRow` and `sortClassRows`

The three orderings the dropdown offers. The sharp rule is that missing data **sinks** rather than sorting as zero — the same rule and the same reasoning as `lib/homework/sort.ts`.

**Files:**
- Modify: `web/src/lib/teacher/class-progress.ts`
- Test: `web/src/lib/teacher/class-progress.test.ts`

- [ ] **Step 1: Write the failing test**

First widen the two existing imports at the top of `web/src/lib/teacher/class-progress.test.ts` — ESLint's `import/first` rejects a second import block further down the file:

```ts
import type { PaceStatus, Surah } from "@/lib/hifz/pace";
import { lastPassedSurah, sortClassRows, CLASS_SORTS, type ClassRow } from "./class-progress";
```

Then append to the same file:

```ts
const row = (
  name: string,
  pace: PaceStatus | null,
  hwAvg: number | null,
): ClassRow => ({
  studentId: name.toLowerCase(),
  name,
  lastPassed: "S3",
  passed: 3,
  target: 43,
  expected: 4,
  pace,
  hwAvg,
});

const names = (rows: ClassRow[]) => rows.map((r) => r.name);

describe("sortClassRows", () => {
  const rows: ClassRow[] = [
    row("Aisha", "ok", 87.4),
    row("Bilal", "warn", 72.1),
    row("Khadija", "ok", 91.2),
    row("Yusuf", "danger", 64.8),
    row("Zainab", "danger", 71),
  ];

  it("attention puts behind first, then on pace, then ahead", () => {
    expect(names(sortClassRows(rows, "attention"))).toEqual([
      "Yusuf", "Zainab", "Bilal", "Aisha", "Khadija",
    ]);
  });

  it("name sorts A-Z", () => {
    expect(names(sortClassRows(rows, "name"))).toEqual([
      "Aisha", "Bilal", "Khadija", "Yusuf", "Zainab",
    ]);
  });

  it("lowest-hw sorts by homework average ascending", () => {
    expect(names(sortClassRows(rows, "lowest-hw"))).toEqual([
      "Yusuf", "Zainab", "Bilal", "Aisha", "Khadija",
    ]);
  });

  it("sinks a student with no target to the bottom of attention", () => {
    // A missing hifz profile is a data gap, not a struggling student.
    const withGap = [...rows, row("Musa", null, 55)];
    expect(names(sortClassRows(withGap, "attention")).at(-1)).toBe("Musa");
  });

  it("sinks unmarked homework to the bottom rather than scoring it zero", () => {
    // Scoring null as 0 would head the list with a student nobody has marked,
    // burying the genuinely weakest one.
    const withGap = [...rows, row("Musa", "warn", null)];
    const sorted = names(sortClassRows(withGap, "lowest-hw"));
    expect(sorted.at(-1)).toBe("Musa");
    expect(sorted[0]).toBe("Yusuf");
  });

  it("treats a NaN average as no average at all", () => {
    const withNaN = [row("Musa", "warn", NaN), row("Aisha", "ok", 87.4)];
    expect(names(sortClassRows(withNaN, "lowest-hw"))).toEqual(["Aisha", "Musa"]);
  });

  it("falls back to name on a tie, so the order never shuffles", () => {
    const tied = [row("Zainab", "warn", 70), row("Aisha", "warn", 70)];
    expect(names(sortClassRows(tied, "attention"))).toEqual(["Aisha", "Zainab"]);
    expect(names(sortClassRows(tied, "lowest-hw"))).toEqual(["Aisha", "Zainab"]);
  });

  it("does not mutate the input", () => {
    const input = [...rows];
    sortClassRows(input, "attention");
    expect(names(input)).toEqual(names(rows));
  });

  it("offers exactly the three orderings the dropdown renders", () => {
    expect(CLASS_SORTS).toEqual(["attention", "name", "lowest-hw"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/teacher/class-progress.test.ts`
Expected: FAIL — `"sortClassRows" is not exported by "src/lib/teacher/class-progress.ts"`.

- [ ] **Step 3: Write the minimal implementation**

First widen the import at the top of `web/src/lib/teacher/class-progress.ts` — `PaceStatus` is needed from here on:

```ts
import { memorisationList, type PaceStatus, type Surah } from "@/lib/hifz/pace";
```

Then append to the same file:

```ts
/** One student's line on the dashboard. Every number here came from a view. */
export type ClassRow = {
  studentId: string;
  name: string;
  /** English name of the last surah passed; null when nothing is passed. */
  lastPassed: string | null;
  passed: number;
  target: number;
  expected: number;
  /** null when the student has no hifz profile — no target to judge against. */
  pace: PaceStatus | null;
  /** null when no homework has been marked this term. */
  hwAvg: number | null;
};

export const CLASS_SORTS = ["attention", "name", "lowest-hw"] as const;
export type ClassSort = (typeof CLASS_SORTS)[number];

const PACE_RANK: Record<PaceStatus, number> = { danger: 0, warn: 1, ok: 2 };

/** No profile ranks below every real status: a missing target is a data gap,
 *  not a struggling student, and shouldn't head a "needs attention" list. */
const paceRank = (pace: PaceStatus | null) => (pace === null ? 3 : PACE_RANK[pace]);

/**
 * A usable average, or null. A malformed view row can reach us as NaN, which
 * must behave exactly like "no mark" rather than poisoning every comparison it
 * touches (`NaN < x` and `NaN > x` are both false, which quietly scrambles a
 * sort instead of failing).
 */
const scoreOf = (pct: number | null): number | null =>
  typeof pct === "number" && Number.isFinite(pct) ? pct : null;

/** Every ordering ends here, so the list is never arbitrary and never
 *  shuffles between renders. */
const byName = (a: ClassRow, b: ClassRow) => a.name.localeCompare(b.name);

export function sortClassRows(rows: ClassRow[], sort: ClassSort): ClassRow[] {
  const out = [...rows];

  if (sort === "name") return out.sort(byName);

  if (sort === "attention") {
    return out.sort((a, b) => paceRank(a.pace) - paceRank(b.pace) || byName(a, b));
  }

  return out.sort((a, b) => {
    const x = scoreOf(a.hwAvg);
    const y = scoreOf(b.hwAvg);
    // Unmarked work sinks to the bottom. Scoring it zero would head the list
    // with a student nobody has marked, burying the real weak spots.
    if (x === null || y === null) {
      return (x === null ? 1 : 0) - (y === null ? 1 : 0) || byName(a, b);
    }
    return x - y || byName(a, b);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/teacher/class-progress.test.ts`
Expected: PASS — 15 tests total (6 from Task 1, 9 here).

- [ ] **Step 5: Commit**

```bash
cd web
git add src/lib/teacher/class-progress.ts src/lib/teacher/class-progress.test.ts
git commit -m "feat(teacher): three orderings for the class list, missing data sinks"
```

---

### Task 3: `getClassProgress` query

Assembles `ClassRow[]` from existing views. No new view, no migration.

`weeks` and `now` are parameters rather than fetched here: `/teacher/home` already calls `getTermsAndWeeks()`, and passing them in avoids a second calendar query while keeping the function's output deterministic for a given input.

**Files:**
- Modify: `web/src/lib/dashboard/queries.ts` (append at end of file)

There is no unit test for this task — it is a database read, and the codebase reserves DB-touching tests for `*.live.test.ts` files that are excluded from the default run. It is verified by `tsc` here and by the browser check in Task 5.

- [ ] **Step 1: Add the imports**

At the top of `web/src/lib/dashboard/queries.ts`, below the existing `import { supabaseServer } from "@/lib/supabase/server";`, add:

```ts
import { expectedPassed, paceStatus, type Surah } from "@/lib/hifz/pace";
import { lastPassedSurah, type ClassRow } from "@/lib/teacher/class-progress";
```

- [ ] **Step 2: Append the function**

Append to the end of `web/src/lib/dashboard/queries.ts`:

```ts
/**
 * The dashboard's per-student view of one class.
 *
 * Composes what already exists rather than adding anything: hifz counts from
 * `v_hifz_progress`, the homework mean from `v_termly_avg`, pace from the
 * teaching calendar. No grade is recomputed here.
 *
 * `weeks` and `now` are passed in, not fetched: the caller already has the
 * calendar, and taking `now` as an argument keeps the output deterministic.
 *
 * Only active students. That matches the "Active students" tile rendered
 * directly above the list, so the two can never disagree.
 */
export async function getClassProgress(
  classId: string,
  termId: number,
  weeks: { unlock_at: string }[],
  now = new Date(),
): Promise<ClassRow[]> {
  const db = await supabaseServer();

  const { data: students } = await db
    .from("profiles")
    .select("id, full_name")
    .eq("class_id", classId)
    .eq("role", "student")
    .eq("is_active", true)
    .order("full_name");

  const ids = (students ?? []).map((s) => s.id);
  if (!ids.length) return [];

  const [hifz, records, avgs, surahs] = await Promise.all([
    db.from("v_hifz_progress")
      .select("student_id, passed, target_count, start_surah").in("student_id", ids),
    db.from("hifz_records").select("student_id, surah_number").in("student_id", ids),
    db.from("v_termly_avg")
      .select("student_id, hw_avg").in("student_id", ids).eq("term_id", termId),
    db.from("surahs").select("number, order_index, name_ar, name_en").order("order_index"),
  ]);

  // Views expose every column as nullable — drop any row that lost its key.
  const hifzOf = new Map(
    (hifz.data ?? [])
      .filter((r) => r.student_id !== null)
      .map((r) => [r.student_id as string, r] as const),
  );
  const avgOf = new Map(
    (avgs.data ?? [])
      .filter((r) => r.student_id !== null)
      .map((r) => [r.student_id as string, r.hw_avg] as const),
  );

  const passedOf = new Map<string, Set<number>>();
  for (const r of records.data ?? []) {
    const set = passedOf.get(r.student_id) ?? new Set<number>();
    set.add(r.surah_number);
    passedOf.set(r.student_id, set);
  }

  const allSurahs = (surahs.data ?? []) as Surah[];
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  return (students ?? []).map((s): ClassRow => {
    const h = hifzOf.get(s.id);
    const target = Number(h?.target_count ?? 0);
    const passed = Number(h?.passed ?? 0);
    const expected = expectedPassed(now, weeks, target);
    const last = h
      ? lastPassedSurah(
          Number(h.start_surah),
          target,
          allSurahs,
          passedOf.get(s.id) ?? new Set<number>(),
        )
      : null;

    return {
      studentId: s.id,
      name: s.full_name,
      lastPassed: last?.name_en ?? null,
      passed,
      target,
      expected,
      // No hifz profile → no target → nothing to judge them against.
      pace: h ? paceStatus(passed, expected) : null,
      hwAvg: num(avgOf.get(s.id)),
    };
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
cd web
git add src/lib/dashboard/queries.ts
git commit -m "feat(teacher): getClassProgress assembles the class list from existing views"
```

---

### Task 4: The `ClassProgress` component

Client component. Every row is already on the page, so sorting reorders in the browser — no round trip, and no URL state to keep in step with a server render. Same shape as `components/app/marked-homework.tsx`.

Badge wording and colours match `/teacher/hifz` exactly. Two pages describing the same status in different words would be worse than either wording alone.

**Files:**
- Create: `web/src/components/app/class-progress.tsx`
- Test: `web/src/components/app/class-progress.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/src/components/app/class-progress.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ClassProgress } from "./class-progress";
import type { ClassRow } from "@/lib/teacher/class-progress";
import type { PaceStatus } from "@/lib/hifz/pace";

const row = (
  name: string,
  pace: PaceStatus | null,
  hwAvg: number | null,
  lastPassed: string | null = "Al-Balad",
): ClassRow => ({
  // No spaces: this lands in a URL, and the assertion below reads it back raw.
  studentId: name.split(" ")[0].toLowerCase(),
  name,
  lastPassed,
  passed: 12,
  target: 43,
  expected: 10,
  pace,
  hwAvg,
});

const rows: ClassRow[] = [
  row("Aisha Khan", "ok", 87.4),
  row("Bilal Rahman", "warn", 72.1),
  row("Yusuf Ahmed", "danger", 64.8),
];

/** Each row's full text, in render order. Assertions use `toContain`, so this
 *  stays honest without depending on how the spans happen to be spaced. */
const rowTexts = (c: HTMLElement) =>
  [...c.querySelectorAll("li")].map((li) => li.textContent ?? "");
const chooseSort = (c: HTMLElement, value: string) =>
  fireEvent.change(c.querySelector("select")!, { target: { value } });

describe("ClassProgress", () => {
  it("defaults to needs-attention, so the student behind is first", () => {
    const { container } = render(<ClassProgress rows={rows} termId={2} />);
    expect(rowTexts(container)[0]).toContain("Yusuf Ahmed");
  });

  it("reorders when the teacher picks a different sort", () => {
    const { container } = render(<ClassProgress rows={rows} termId={2} />);
    chooseSort(container, "name");
    expect(rowTexts(container)[0]).toContain("Aisha Khan");
  });

  it("shows the last-passed surah and the homework average", () => {
    const { container } = render(<ClassProgress rows={rows} termId={2} />);
    expect(container.textContent).toContain("Al-Balad");
    expect(container.textContent).toContain("87.4%");
  });

  it("renders a dash rather than a zero for missing data", () => {
    const { container } = render(
      <ClassProgress rows={[row("Musa Ali", null, null, null)]} termId={2} />,
    );
    expect(container.textContent).toContain("no target");
    expect(container.textContent).not.toContain("0.0%");
  });

  it("labels each pace status the same way the hifz register does", () => {
    const { container } = render(<ClassProgress rows={rows} termId={2} />);
    expect(container.textContent).toContain("ahead");
    expect(container.textContent).toContain("on pace");
    expect(container.textContent).toContain("behind");
  });

  it("links each student to their hifz detail page", () => {
    const { container } = render(<ClassProgress rows={rows} termId={2} />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/teacher/hifz/aisha");
  });

  it("says so when the class is empty instead of rendering a bare list", () => {
    const { container } = render(<ClassProgress rows={[]} termId={2} />);
    expect(container.textContent).toContain("No students in this class yet");
    expect(container.querySelector("select")).toBeNull();
  });

  it("names the term the homework average covers", () => {
    const { container } = render(<ClassProgress rows={rows} termId={3} />);
    expect(container.textContent).toContain("Term 3");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/app/class-progress.test.tsx`
Expected: FAIL — `Failed to resolve import "./class-progress"`.

- [ ] **Step 3: Write the minimal implementation**

Create `web/src/components/app/class-progress.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { FilterSelect } from "@/components/app/filter-select";
import { sortClassRows, type ClassRow, type ClassSort } from "@/lib/teacher/class-progress";
import { cn } from "@/lib/utils";

const SORTS: { value: ClassSort; label: string; announce: string }[] = [
  { value: "attention", label: "Needs attention", announce: "furthest behind target first" },
  { value: "name", label: "Name A–Z", announce: "by name" },
  { value: "lowest-hw", label: "Lowest homework", announce: "lowest homework average first" },
];

/** Same words as /teacher/hifz. One status, one vocabulary. */
const PACE_LABEL = { ok: "ahead", warn: "on pace", danger: "behind" } as const;

/**
 * The class, student by student, on the teacher dashboard.
 *
 * Every row is already on the page, so the sort reorders in the browser — no
 * round trip, and no URL state to keep in step with a server render.
 */
export function ClassProgress({ rows, termId }: { rows: ClassRow[]; termId: number }) {
  const [sort, setSort] = useState<ClassSort>("attention");
  const uid = useId();

  const sorted = useMemo(() => sortClassRows(rows, sort), [rows, sort]);
  const announce = SORTS.find((s) => s.value === sort)!.announce;

  if (!rows.length) {
    return (
      <p className="rounded-lg border border-line bg-card p-6 text-sm text-muted-foreground">
        No students in this class yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <FilterSelect
        label="Sort"
        value={sort}
        options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
        onChange={(v) => setSort(v as ClassSort)}
        controls={uid}
      />

      {/* Reordering is silent to a screen reader, and this is always mounted so
          the change is announced rather than merely appearing. */}
      <p className="sr-only" aria-live="polite">
        Class list sorted {announce}.
      </p>

      <ul id={uid} className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
        {sorted.map((r) => (
          <li key={r.studentId}>
            <Link
              href={`/teacher/hifz/${r.studentId}`}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/60"
            >
              <span className="min-w-0">
                <span className="text-sm font-medium">{r.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {r.lastPassed ?? "—"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {r.passed}/{r.target || "—"} · expected {r.expected}
                </span>
                <span className="w-14 text-right text-xs tabular-nums">
                  {r.hwAvg === null ? "—" : `${r.hwAvg.toFixed(1)}%`}
                </span>
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-medium",
                    r.pace === null && "bg-muted text-muted-foreground",
                    r.pace === "ok" && "bg-ok/12 text-ok",
                    r.pace === "warn" && "bg-warn/12 text-warn",
                    r.pace === "danger" && "bg-danger/12 text-danger",
                  )}
                >
                  {r.pace === null ? "no target" : PACE_LABEL[r.pace]}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Homework average is for Term {termId}. Unsubmitted homework is excluded from the
        average, not counted as zero.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/app/class-progress.test.tsx`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
cd web
git add src/components/app/class-progress.tsx src/components/app/class-progress.test.tsx
git commit -m "feat(teacher): class progress list with a sort dropdown"
```

---

### Task 5: Render it on the dashboard

Two of the three existing tiles get derived from the same rows instead of being queried separately. That removes two round trips and — more importantly — makes it impossible for the "Active students" count or the "Homework avg" tile to disagree with the list printed underneath them.

The **Hifz avg** tile keeps its own `v_hifz_progress` query, because its `pct` is computed in SQL. Deriving it from `passed / target` in TypeScript would move a verified formula out of the database, against the rule stated at the top of `queries.ts`.

**Files:**
- Modify: `web/src/app/teacher/home/page.tsx`

All three edits below are quoted by content, not by line number — Step 1 adds a line and shifts everything under it.

- [ ] **Step 1: Update the imports**

In `web/src/app/teacher/home/page.tsx`, change:

```tsx
import { getTermsAndWeeks, currentTermId } from "@/lib/dashboard/queries";
import { StatTile } from "@/components/app/stat-tile";
```

to:

```tsx
import { getTermsAndWeeks, currentTermId, getClassProgress } from "@/lib/dashboard/queries";
import { StatTile } from "@/components/app/stat-tile";
import { ClassProgress } from "@/components/app/class-progress";
```

- [ ] **Step 2: Take `weeks` off the calendar call**

Change:

```tsx
  const { terms } = await getTermsAndWeeks();
```

to:

```tsx
  const { terms, weeks } = await getTermsAndWeeks();
```

- [ ] **Step 3: Replace the tile queries with derived values**

Replace this entire block:

```tsx
  const { data: roster } = myClass
    ? await db.from("profiles").select("id").eq("class_id", myClass.id).eq("role", "student").eq("is_active", true)
    : { data: [] };

  const rosterIds = (roster ?? []).map((r) => r.id);
  const { data: avgRows } = rosterIds.length
    ? await db.from("v_termly_avg").select("hw_avg").in("student_id", rosterIds).eq("term_id", termId)
    : { data: [] };
  const { data: hifzRows } = rosterIds.length
    ? await db.from("v_hifz_progress").select("pct").in("student_id", rosterIds)
    : { data: [] };

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const classAvg = mean((avgRows ?? []).map((r) => Number(r.hw_avg)));
  const hifzAvg = mean((hifzRows ?? []).map((r) => Number(r.pct)));
```

with:

```tsx
  const classRows = myClass ? await getClassProgress(myClass.id, termId, weeks) : [];
  const rosterIds = classRows.map((r) => r.studentId);

  // Hifz pct is computed in SQL and stays there; deriving it from
  // passed / target here would move a verified formula into TypeScript.
  const { data: hifzRows } = rosterIds.length
    ? await db.from("v_hifz_progress").select("pct").in("student_id", rosterIds)
    : { data: [] };

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const classAvg = mean(classRows.map((r) => r.hwAvg).filter((v): v is number => v !== null));
  const hifzAvg = mean((hifzRows ?? []).map((r) => Number(r.pct)));
```

- [ ] **Step 4: Render the list under the tiles**

In the `My class` section, change:

```tsx
          <StatTile label="Hifz avg" value={hifzAvg === null ? null : `${hifzAvg.toFixed(1)}%`} sub="of each student's target" />
        </div>
        <div className="flex flex-wrap gap-2">
```

to:

```tsx
          <StatTile label="Hifz avg" value={hifzAvg === null ? null : `${hifzAvg.toFixed(1)}%`} sub="of each student's target" />
        </div>

        <ClassProgress rows={classRows} termId={termId} />

        <div className="flex flex-wrap gap-2">
```

- [ ] **Step 5: Typecheck and lint**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: no output from `tsc`; lint reports no errors.

- [ ] **Step 6: Check it in the browser**

Run: `cd web && npm run dev`

Sign in as a teacher and open `http://localhost:3000/teacher/home`. Confirm:
- the student list renders under the three tiles
- the "Active students" tile equals the number of rows
- students behind target are at the top by default
- changing the dropdown to "Name A–Z" reorders without a page reload
- clicking a student opens `/teacher/hifz/<id>`

Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
cd web
git add src/app/teacher/home/page.tsx
git commit -m "feat(teacher): per-student class list on the dashboard"
```

---

### Task 6: Fix next-surah on the Hifz register

`web/src/app/teacher/hifz/page.tsx:66` computes the next surah as `surahs[passed]`, indexing the **global** ordered list and ignoring the student's `start_surah`. It is correct only for students starting at An-Nas; every returning student who starts partway down the run is shown the wrong surah. `memorisationList()` exists for exactly this, and `/teacher/hifz/[studentId]` already uses it properly.

- [ ] **Step 1: Update the import**

In `web/src/app/teacher/hifz/page.tsx`, change line 4 from:

```tsx
import { expectedPassed, paceStatus } from "@/lib/hifz/pace";
```

to:

```tsx
import { expectedPassed, paceStatus, memorisationList, type Surah } from "@/lib/hifz/pace";
```

- [ ] **Step 2: Select the column `memorisationList` needs**

`Surah` requires `name_ar`, which this page does not currently fetch. Change line 35 from:

```tsx
  const { data: surahs } = await db.from("surahs").select("number, name_en, order_index").order("order_index");
```

to:

```tsx
  const { data: surahs } = await db
    .from("surahs").select("number, order_index, name_ar, name_en").order("order_index");
```

- [ ] **Step 3: Walk the student's own run**

Change line 66 from:

```tsx
          const next = (surahs ?? [])[passed];
```

to:

```tsx
          // The student's OWN run — a returning student's start_surah is not
          // 114, so indexing the global list here would name the wrong surah.
          const next = memorisationList(
            Number(p?.start_surah ?? 114),
            target,
            (surahs ?? []) as Surah[],
          )[passed];
```

- [ ] **Step 4: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no output (exit 0).

- [ ] **Step 5: Check it in the browser**

Run: `cd web && npm run dev`

Open `http://localhost:3000/teacher/hifz`. Confirm every student still shows a `next:` surah and that the names run backwards from An-Nas for a student starting at 114. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
cd web
git add src/app/teacher/hifz/page.tsx
git commit -m "fix(teacher): next surah must follow the student's own run, not the global list"
```

---

### Task 7: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `cd web && npm test`
Expected: all files pass, including the two new ones. Nothing previously green has turned red.

- [ ] **Step 2: Lint**

Run: `cd web && npm run lint`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `cd web && npm run build`
Expected: build completes. This is the gate that matters — Netlify runs the same command, and a push to `main` deploys straight to production with no other check.

- [ ] **Step 4: Confirm the branch, do not push to main**

Run: `git branch --show-current`
Expected: `feat/liquid-glass-redesign` (or whatever feature branch this work started on) — **not** `main`.

Leave the work on the branch. Merging to `main` is a release decision for the user to make.

---

## Spec coverage

| Spec section | Task |
| --- | --- |
| `lastPassedSurah`, furthest-along rule | 1 |
| `ClassRow`, `CLASS_SORTS`, `sortClassRows` | 2 |
| `getClassProgress(classId, termId)` | 3 |
| `ClassProgress` component, `FilterSelect`, row links | 4 |
| Placement under the tiles on `/teacher/home` | 5 |
| Badge wording matching `/teacher/hifz` | 4 |
| Homework footnote about unsubmitted work | 4 |
| Three sort rules, null-sinking | 2 |
| Six edge cases | 2 (nulls), 4 (rendering, empty class), 5 (no class assigned) |
| `/teacher/hifz` `start_surah` fix | 6 |
| Seven unit tests | 1, 2 |
| No new view or migration | — none added |

The "teacher has no class assigned" case needs no new code: `myClass` is already null in that path, `classRows` is `[]`, and the component renders its empty state under the existing "No class assigned" header.
