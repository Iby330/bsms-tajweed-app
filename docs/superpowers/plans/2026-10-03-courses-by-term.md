# Courses by Term Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The student Courses page shows the year as Term 1 / 2 / 3 tiles (open term clickable, each open course a direct link; locked terms list course names but link nowhere), with "Rest of the programme" below holding only courses outside the class's plan.

**Architecture:** A pure `termIndex()` in `lib/curriculum/catalogue.ts` layers on the existing, tested `courseIndex()` (which already joins the student's tree to the catalogue and decides which course tiles are openable). A new `TermTile` server component renders one term. `app/(student)/courses/page.tsx` swaps its two course sections for three term tiles plus the rest. Spec: `docs/superpowers/specs/2026-10-03-courses-by-term-design.md`.

**Tech Stack:** Next.js 16 app router (server components), TypeScript, vitest + @testing-library/react (jsdom), house CSS in `src/app/globals.css`.

All paths below are relative to `web/`. Run commands from `web/`.

---

### Task 1: `termIndex` — the data for the page

**Files:**
- Modify: `src/lib/curriculum/catalogue.ts` (append after `courseIndex`)
- Test: `src/lib/curriculum/catalogue.test.ts` (append a `describe("termIndex")`)

- [ ] **Step 1: Write the failing tests** — append to `src/lib/curriculum/catalogue.test.ts`, and add `termIndex` to its import from `./catalogue` and `type Course, type Term` to its import from `./tree`:

```ts
describe("termIndex", () => {
  /** A course as the tree hands it over, without building a whole tree. */
  const course = (
    series: string, label: string, unlocked: number, modules: number, opensAt: string | null = null,
  ) => ({
    termId: 1, series, label, blurb: "", modules: [], moduleCount: modules,
    unlockedCount: unlocked, actionableCount: unlocked, doneCount: 0,
    hasHomework: modules > 0, opensAt, nextModule: null,
  }) as Course;
  const term = (
    id: number, courses: Course[], lockedWeeks: { number: number; unlockAt: string }[] = [],
  ) => ({
    id, startsOn: "2026-10-05", endsOn: "2026-11-26", examMax: 80, isCurrent: id === 1,
    courses, moduleCount: 0, actionableCount: 5, doneCount: 2, weekCount: 8, lockedWeeks,
  }) as Term;

  it("opens the current term and links each course that has started", () => {
    const tree = buildTree(asSeenBy(groupOne, NOW), NOW, groupOne);
    const { terms: tiles } = termIndex(cat(NOW), tree, true);
    const t1 = tiles.find((t) => t.id === 1)!;
    expect(t1.open).toBe(true);
    expect(t1.href).toBe("/courses/1");
    expect(t1.courses.map((c) => c.href)).toEqual(["/courses/1/ghunna", "/courses/1/mudood"]);
    expect(t1.opensAt).toBeNull();
  });

  it("never links a course in the open term that has not started or is empty", () => {
    const { terms: tiles } = termIndex([], [term(1, [
      course("ghunna", "Ghunna", 2, 8),
      course("mudood", "Mudūd", 0, 6, "2026-10-29T13:00:00Z"),
      course("sifaat_new", "Ṣifāt series", 0, 0),
    ])], true);
    expect(tiles[0].open).toBe(true);
    expect(tiles[0].courses).toEqual([
      { key: "ghunna", label: "Ghunna", href: "/courses/1/ghunna" },
      { key: "mudood", label: "Mudūd", href: null },
      { key: "sifaat_new", label: "Ṣifāt series", href: null },
    ]);
  });

  it("links nothing in a term that has not opened, and says when it opens", () => {
    const { terms: tiles } = termIndex([], [term(2, [
      course("sifaat_old", "Ṣifāt", 0, 7, "2026-12-31T13:00:00Z"),
    ])], true);
    expect(tiles[0]).toMatchObject({
      open: false, href: null, opensAt: "2026-12-31T13:00:00Z", progress: null,
      courses: [{ key: "sifaat_old", label: "Ṣifāt", href: null }],
    });
  });

  it("dates a term with nothing planned by its first week, naming no courses", () => {
    const { terms: tiles } = termIndex([], [term(3, [], [
      { number: 2, unlockAt: "2027-03-18T13:00:00Z" },
      { number: 1, unlockAt: "2027-03-11T13:00:00Z" },
    ])], true);
    expect(tiles[0]).toMatchObject({ open: false, href: null, courses: [], opensAt: "2027-03-11T13:00:00Z" });
  });

  it("dates a later term by the class's own calendar", () => {
    const tree = buildTree(asSeenBy(groupTwo, NOW), NOW, groupTwo);
    const t3 = termIndex(cat(NOW), tree, true).terms.find((t) => t.id === 3)!;
    expect(t3.open).toBe(false);
    expect(t3.courses.map((c) => c.href)).toEqual([null]);
    expect(Date.parse(t3.opensAt!)).toBe(Date.parse("2027-03-15T00:00:00Z"));
  });

  it("puts only courses outside the plan in the rest of the programme", () => {
    const tree = buildTree(asSeenBy(groupTwo, NOW), NOW, groupTwo);
    const { rest } = termIndex(cat(NOW), tree, true);
    // Group 2 takes Mudūd in Term 3: it is in that term's tile, not here.
    expect(rest.map((t) => t.block.series)).toEqual(["umm_al_kitab"]);
    expect(rest.every((t) => t.href === null)).toBe(true);
  });

  it("leaves the rest empty for a reader on the whole programme", () => {
    const tree = buildTree(asSeenBy(null, NOW), NOW, null);
    expect(termIndex(cat(NOW), tree, false).rest).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/lib/curriculum/catalogue.test.ts`
Expected: FAIL — `termIndex` is not exported.

- [ ] **Step 3: Implement** — append to `src/lib/curriculum/catalogue.ts` after `courseIndex`:

```ts
/** A course named on a term tile: a link only when something in it is open. */
export type TermCourse = { key: string; label: string; href: string | null };

/** One term of the reader's year, as the Courses page shows it. */
export type TermTile = {
  id: number;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  /** Something in the term has opened for this reader. */
  open: boolean;
  /** The term page; an open term only. */
  href: string | null;
  /** When it opens for this reader; a term not yet open only. */
  opensAt: string | null;
  courses: TermCourse[];
  /** Modules done / modules with something in them; an open term only. */
  progress: { done: number; total: number } | null;
};

export type TermIndex = { terms: TermTile[]; rest: IndexTile[] };

/**
 * The year by term, and the programme beyond the reader's plan.
 *
 * Built on courseIndex, which already joins the tree to the catalogue and
 * decides which course is openable: a course is linked here exactly when it
 * is an open tile there. A term is open when any of its courses is. A term
 * not yet open links nothing and is dated by its earliest course, or, with no
 * course planned, by its first week on the reader's calendar.
 */
export function termIndex(
  catalogue: CourseBlock[],
  terms: Term[],
  hasSyllabus: boolean,
): TermIndex {
  const { mine, locked } = courseIndex(catalogue, terms, hasSyllabus);
  const tileById = new Map([...mine, ...locked].map((t) => [t.id, t]));
  const earliest = (dates: string[]) =>
    dates.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;

  const tiles = terms.map((term): TermTile => {
    const courses = term.courses.map((course) => {
      const tile = tileById.get(`${term.id} ${course.series}`);
      return { key: course.series, label: tile?.block.label ?? course.label, href: tile?.href ?? null };
    });
    const open = courses.some((c) => c.href !== null);
    const opensAt = open
      ? null
      : earliest(term.courses.flatMap((c) => (c.opensAt ? [c.opensAt] : [])))
        ?? earliest(term.lockedWeeks.map((w) => w.unlockAt));
    return {
      id: term.id,
      startsOn: term.startsOn,
      endsOn: term.endsOn,
      isCurrent: term.isCurrent,
      open,
      href: open ? `/courses/${term.id}` : null,
      opensAt,
      courses,
      progress: open ? { done: term.doneCount, total: term.actionableCount } : null,
    };
  });

  // Without a syllabus the tree is the whole programme: nothing left over is
  // someone else's, so there is no "rest" to show.
  const rest = hasSyllabus ? locked.filter((t) => t.reason === "not-running") : [];
  return { terms: tiles, rest };
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run src/lib/curriculum/catalogue.test.ts`
Expected: PASS, including the existing `courseIndex` tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/curriculum/catalogue.ts web/src/lib/curriculum/catalogue.test.ts
git commit -m "feat(courses): the year as terms, and the rest of the programme apart"
```

### Task 2: `TermTile` — one term on the page

**Files:**
- Create: `src/components/app/term-tile.tsx`
- Test: `src/components/app/term-tile.test.tsx`
- Modify: `src/app/globals.css` (one rule beside `.tcard.locked`, ~line 2173)

- [ ] **Step 1: Write the failing test** — `src/components/app/term-tile.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TermTile } from "./term-tile";
import type { TermTile as Tile } from "@/lib/curriculum/catalogue";

afterEach(cleanup);

const base: Tile = {
  id: 1, startsOn: "2026-10-05", endsOn: "2026-11-26", isCurrent: true,
  open: true, href: "/courses/1", opensAt: null, progress: { done: 2, total: 5 },
  courses: [
    { key: "ghunna", label: "Ghunna", href: "/courses/1/ghunna" },
    { key: "mudood", label: "Mudūd", href: null },
  ],
};

describe("TermTile", () => {
  it("links the term and only the courses that are open", () => {
    const { container, getByText } = render(<TermTile tile={base} />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/courses/1", "/courses/1/ghunna"]);
    expect(getByText("Mudūd").closest("a")).toBeNull();
    expect(getByText("Current term")).toBeTruthy();
  });

  it("has no link at all when the term has not opened", () => {
    const { container, getByText } = render(<TermTile tile={{
      ...base, id: 2, isCurrent: false, open: false, href: null, progress: null,
      opensAt: "2026-12-31T13:00:00Z",
      courses: [{ key: "sifaat_old", label: "Ṣifāt", href: null }],
    }} />);
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(getByText(/^Opens /)).toBeTruthy();
    expect(getByText("Ṣifāt")).toBeTruthy();
  });

  it("names nothing for a term with no courses, only when it opens", () => {
    const { container } = render(<TermTile tile={{
      ...base, id: 3, isCurrent: false, open: false, href: null, progress: null,
      opensAt: "2027-03-11T13:00:00Z", courses: [],
    }} />);
    expect(container.querySelectorAll("li")).toHaveLength(0);
    expect(container.textContent).toMatch(/Opens /);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/components/app/term-tile.test.tsx`
Expected: FAIL — cannot resolve `./term-tile`.

- [ ] **Step 3: Implement** — `src/components/app/term-tile.tsx`:

```tsx
import Link from "next/link";
import { ProgressBar } from "@/components/app/progress-bar";
import { fmtDay } from "@/lib/format";
import type { TermTile as Tile } from "@/lib/curriculum/catalogue";
import { cn } from "@/lib/utils";

const dmy = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * One term of the student's year. Open: the heading links to the term, and
 * each course that has started links straight to itself, so reaching a
 * course is no more clicks than it was. Not open: no link anywhere, the
 * courses named as plain text and the date it opens. A course is a link only
 * when termIndex gave it an href, which is only when something in it is open.
 */
export function TermTile({ tile }: { tile: Tile }) {
  const heading = `Term ${tile.id}`;
  return (
    <div
      className={cn("tcard term-card", !tile.open && "locked")}
      aria-label={tile.open ? heading : `${heading}, locked`}
    >
      <span className="label">{dmy(tile.startsOn)} – {dmy(tile.endsOn)}</span>
      <h2>{tile.href ? <Link href={tile.href}>{heading}</Link> : heading}</h2>

      {tile.courses.length > 0 && (
        <ul className="term-courses">
          {tile.courses.map((c) => (
            <li key={c.key}>
              {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-4">
        {tile.open && tile.progress ? (
          <>
            <ProgressBar
              done={tile.progress.done}
              total={tile.progress.total}
              emptyNote="Waiting on videos"
              label={`${heading}: ${tile.progress.done} of ${tile.progress.total} modules complete`}
            />
            {tile.isCurrent && <span className="label hi mt-2 inline-block">Current term</span>}
          </>
        ) : tile.opensAt ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden>🔒</span>
            Opens {fmtDay(tile.opensAt)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
```

And in `src/app/globals.css`, directly after the `.tcard.locked:hover` rule (~line 2174), add:

```css
  .term-courses { margin: 10px 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 14px; }
  .term-courses a { text-decoration: underline; text-underline-offset: 3px; }
  .term-courses span { color: var(--muted-foreground); }
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/components/app/term-tile.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/app/term-tile.tsx web/src/components/app/term-tile.test.tsx web/src/app/globals.css
git commit -m "feat(courses): a term tile that links only what is open"
```

### Task 3: The Courses page shows terms, then the rest

**Files:**
- Modify: `src/app/(student)/courses/page.tsx` (whole file)

- [ ] **Step 1: Replace the page body.** Change the imports and render, keeping the header stats:

```tsx
import { currentProfile } from "@/lib/supabase/server";
import { getStudentCurriculum } from "@/lib/curriculum/queries";
import { getCatalogue, termIndex } from "@/lib/curriculum/catalogue";
import { findCurrentModule } from "@/lib/curriculum/tree";
import { CourseTile } from "@/components/app/course-tile";
import { TermTile } from "@/components/app/term-tile";
import { Rule } from "@/components/app/rule";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The student's year, term by term, then the rest of the programme.
 *
 * Terms first because that is how the year is taught: the open term links
 * through (and straight to each course that has started), and a term still
 * ahead names what it will teach without opening it. Below, only courses
 * that are in no term of this class's plan, locked, to show the breadth of
 * the programme. A course this class takes later is in its term, not here.
 */
export default async function Courses() {
  const profile = (await currentProfile())!;
  const [{ terms, hasSyllabus }, { blocks: catalogue }] = await Promise.all([
    getStudentCurriculum(profile.id),
    // her section's calendar, so "opens" agrees with her tree
    getCatalogue(new Date(), profile.section),
  ]);

  const { terms: tiles, rest } = termIndex(catalogue, terms, hasSyllabus);

  const live = findCurrentModule(terms);
  const totalDone = terms.reduce((n, t) => n + t.doneCount, 0);
  const totalModules = terms.reduce((n, t) => n + t.actionableCount, 0);

  return (
    <>
      <header className="masthead">
        <h1><span>Courses</span></h1>
        <p>Your year, term by term, and the rest of the programme below it.</p>
        {totalModules > 0 && (
          <div className="meta">
            <span className="label">{totalDone} of {totalModules} modules complete</span>
            {live && (
              <span className="label hi">
                This week · Week {live.module.weekNumber}
              </span>
            )}
          </div>
        )}
      </header>

      <Rule label="Your year" />
      <div className="cards" style={{ ["--n" as string]: tiles.length }}>
        {tiles.map((tile) => <TermTile key={tile.id} tile={tile} />)}
      </div>

      {rest.length > 0 && (
        <>
          <Rule label="The rest of the programme" />
          <p className="note" style={{ marginBottom: 18, maxWidth: "60ch" }}>
            Not part of your class&apos;s plan this year. It is here so you can
            see how much more there is.
          </p>
          <div
            className={cn("cards", rest.length < 3 && "few")}
            style={{ ["--n" as string]: rest.length }}
          >
            {rest.map((tile) => (
              <CourseTile key={tile.id} block={tile.block} href={null} reason={tile.reason} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/(student)/courses/page.tsx"
git commit -m "feat(courses): the Courses page goes by term, then the rest of the programme"
```

### Task 4: Verify against live classes and release

- [ ] **Step 1: Full suite and build**

Run: `npx vitest run && npm run build`
Expected: all tests pass (1 skipped), build succeeds.

- [ ] **Step 2: Check real classes** — render `termIndex` for live data (service-role read, same shape as `getStudentCurriculum` for a class) for Masjid An-Nabawi, Masjid Quba, Masjid Al-Aqsa and Rayyan, and confirm: An-Nabawi Term 1 open with Ghunna and Ṣifāt linked and Mudūd plain (opens week 5); Terms 2/3 locked with course names; Al-Aqsa Term 1 Qāʿidah plain, Term 3 "Opens …" with no names; rest as in the spec's examples.

- [ ] **Step 3: Push to main** (heads-up first, per CLAUDE.md), then confirm the live site serves `/courses` (307 to login when signed out).
