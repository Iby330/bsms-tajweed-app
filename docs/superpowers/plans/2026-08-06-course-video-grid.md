# Course Video Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach the 24 real YouTube videos to their lessons, and replace the flat module list on `/courses/[term]/[series]` with a grid of thumbnail cards.

**Architecture:** A data migration (`0008`) backfills `lessons.youtube_id`, addressed by `(series, term, week)` so it cannot be broken by title edits. A new presentational `ModuleCard` replaces `ModuleRow`; `tree.ts`, its queries and the lesson player are untouched. Thumbnails come straight from `i.ytimg.com` — no API key, no image config.

**Tech Stack:** Next.js 16 (App Router, RSC, Turbopack), React 19, Tailwind v4, Supabase (hosted), Vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-08-06-course-video-grid-design.md`

---

## Context an engineer new to this repo needs

**This is not the Next.js you know.** `web/AGENTS.md` says it outright: this version has breaking changes vs. training data. Read the relevant guide in `web/node_modules/next/dist/docs/` before writing anything unusual. Nothing in this plan needs a new Next API — you are writing plain RSC components and Tailwind classes — but do not "fix" existing patterns you find surprising.

**Run everything from `web/`.** `npm test`, `npm run lint`, `npm run build` all live in `web/package.json`.

**The dev server is already running on http://localhost:3000.** Do not start another — `next dev` refuses to double-start and exits 1. If you need to check it: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` should print `200`.

**`tsx` gotcha:** a script run from outside `web/` compiles as CJS and rejects top-level `await`. Wrap script bodies in `async function main() { … } main();`. This is already recorded in the `apply_migration` journal.

**Branch.** Work happens on `feat/course-video-grid`, branched from `5b4fb8f`. The working tree was clean at branch time.

**Lint baseline — read before running lint.** `npm run lint` **already reports 6 errors and 3 warnings on `main`**, in code this plan does not touch:

| File | Rule |
|---|---|
| `app/(student)/lessons/[lessonId]/page.tsx:35` | Cannot call impure function during render |
| `app/teacher/curriculum/page.tsx:14` | Cannot call impure function during render |
| `components/app/lesson-player.tsx:91` | Cannot access refs during render |
| `components/app/login-form.tsx:26` | setState synchronously within an effect |
| `components/app/shell.tsx:37` | setState synchronously within an effect |
| `components/app/voice-recorder.tsx:59` | setState synchronously within an effect |

Plus 3 unused-var warnings in `import-forms.test.ts` and `marking/llm.test.ts`.

The bar is **"no NEW problems"**, not "lint is clean". Do not fix these six — they are unrelated to this work and fixing them here would bury the real diff. Count before and after.

**Test baseline:** 175 tests across 9 files, all passing. Production build succeeds.

**Live database.** There is no local Supabase. `execution/apply_migration.ts` talks to the hosted project (`ssqeakiutclbiwizrchh`) through the Management API using `SUPABASE_ACCESS_TOKEN` from `.env`. **Applying a migration touches production data.** Task 5 is gated on explicit user confirmation — do not run it early to "check it works".

---

## Verified facts this plan depends on

Established by reading the live database and the channel, not assumed:

- **37 lessons exist.** tajweed T1 W1–8, T2 W1–7, T3 W1–6 (21); umm_al_kitab T1 W1–9 (9); tfp T3 W1–7 (7).
- **The channel has 24 usable videos**, mapping 1:1 by episode number. The other 33 uploads are promos, Shorts and testimonials.
- **13 lessons get no video** (tajweed T3 W1–6, tfp T3 W1–7) and must render a placeholder.
- **One lesson already has a `youtube_id`, and it is wrong.** Tajweed 1 (T1 W1) is set to `M7lc1UVf-VE` — Google's "Embedded Web Player Customization" demo video, left over from building the player. The migration overwrites it. Task 5's verification is what catches this class of error.
- **Live titles use `:` where the `0003` seed wrote an em dash.** Something re-imported them. This is exactly why rows are addressed by position, never by title.
- **`0004`/`0005` only shift dates**, never `term_id` or `weeks.number`, so positional addressing is stable across the demo calendars.
- **`hqdefault.jpg` returns HTTP 200 at 480×360** for the videos spot-checked. 16:9 content is letterboxed with 45px bars = 12.5% each; `object-cover` into a 16:9 box crops 12.5% each edge — exactly the bars, nothing of the frame lost.

---

## File Structure

| File | Responsibility |
|---|---|
| `web/src/lib/lessons/youtube.ts` | **Modify.** Add `thumbnailUrl()` beside the existing `parseYouTubeId()`. Pure, no IO — the whole file already is. |
| `web/src/lib/lessons/youtube.test.ts` | **Modify.** Add a `describe` block for `thumbnailUrl`. |
| `web/src/components/app/module-card.tsx` | **Create.** One module as a card. Presentational only — takes the same props `ModuleRow` took. |
| `web/src/app/(student)/courses/[term]/[series]/page.tsx` | **Modify.** Swap `<ul>` list for a grid; render `ModuleCard`. |
| `web/src/components/app/module-row.tsx` | **Delete** in Task 4, once nothing imports it. |
| `web/supabase/migrations/0008_lesson_videos.sql` | **Create.** Backfill the 24 ids. |

Not touched: `tree.ts` and its tests, `queries.ts`, `lesson-player.tsx`, `lesson-video-input.tsx`, the teacher curriculum page, the homework form, the schema.

---

## Task 1: `thumbnailUrl()` helper

**Files:**
- Modify: `web/src/lib/lessons/youtube.ts`
- Test: `web/src/lib/lessons/youtube.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `web/src/lib/lessons/youtube.test.ts`. Also update the import on line 2 to `import { parseYouTubeId, thumbnailUrl } from "./youtube";`

```typescript
describe("thumbnailUrl", () => {
  it("builds the hqdefault url for an id", () => {
    expect(thumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });

  it("returns null when there is no video", () => {
    expect(thumbnailUrl(null)).toBeNull();
  });

  it("returns null for an empty string rather than a broken url", () => {
    expect(thumbnailUrl("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/lib/lessons/youtube.test.ts`
Expected: FAIL — `thumbnailUrl is not a function` (or a TS error that it is not exported).

- [ ] **Step 3: Write the implementation**

Append to `web/src/lib/lessons/youtube.ts`:

```typescript
/**
 * Poster frame for a lesson video. No API key, no quota — ytimg serves these
 * straight from Google's CDN.
 *
 * `hqdefault` rather than `maxresdefault`: maxres is true 16:9 but only exists
 * if the source was uploaded in HD, which is not true of every video on the
 * channel, and a 404 on a card is worse than a crop. hqdefault is always
 * present at 480×360 with the 16:9 frame letterboxed inside it — 12.5% bars top
 * and bottom, which `object-cover` in a 16:9 box crops off exactly.
 */
export function thumbnailUrl(youtubeId: string | null): string | null {
  if (!youtubeId) return null;
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/lib/lessons/youtube.test.ts`
Expected: PASS — all tests green, including the pre-existing `parseYouTubeId` block.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/lessons/youtube.ts web/src/lib/lessons/youtube.test.ts
git commit -m "feat(lessons): thumbnailUrl helper for module cards"
```

---

## Task 2: `ModuleCard` component

**Files:**
- Create: `web/src/components/app/module-card.tsx`

No unit test: this is a presentational RSC with no logic worth isolating — the only pure part (`thumbnailUrl`) is already tested in Task 1. It is verified in the browser in Task 4, which is the honest way to test a layout.

**Read `web/src/components/app/module-row.tsx` first.** `ModuleCard` keeps its props, its `statusChip` usage, its `dmy` helper and its lock semantics. Only the layout changes.

- [ ] **Step 1: Create the component**

Create `web/src/components/app/module-card.tsx`:

```tsx
import Link from "next/link";
import { MixedText } from "@/components/app/mixed-text";
import { CountdownChip } from "@/components/app/countdown-chip";
import { thumbnailUrl } from "@/lib/lessons/youtube";
import { seriesShort } from "@/lib/lessons/series";
import { statusChip } from "@/lib/homework/logic";
import type { Module } from "@/lib/curriculum/tree";
import { cn } from "@/lib/utils";

const dmy = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** The 16:9 slot at the middle of every card. Exactly one of four states:
 *  locked, no-video-yet, or a real poster frame (optionally ticked). */
function Poster({
  module: m,
  series,
}: {
  module: Module;
  series: string;
}) {
  const lesson = m.lessons.find((l) => l.youtube_id) ?? m.lessons[0];
  const src = thumbnailUrl(lesson?.youtube_id ?? null);

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-muted">
      {!m.unlocked ? (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
          <span aria-hidden className="text-lg">🔒</span>
          <span className="text-xs tabular-nums">unlocks {dmy(m.unlockAt)}</span>
        </div>
      ) : src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          /* hqdefault is 4:3 with 12.5% letterbox bars; object-cover into this
             16:9 box crops exactly those bars and nothing else. */
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
          <span aria-hidden className="text-lg">▸</span>
          <span className="text-xs">{seriesShort(series)} · video coming soon</span>
        </div>
      )}

      {m.unlocked && m.watched && (
        <span
          className="absolute right-2 top-2 rounded-full bg-ok/90 px-1.5 py-0.5 text-[11px] font-medium text-page"
          title="Watched"
        >
          ✓
        </span>
      )}
    </div>
  );
}

/**
 * One week of a course, as a card: a thin title strip, a 16:9 poster, and the
 * actions underneath.
 *
 * The whole card is the link to the lesson (a stretched overlay, not a wrapping
 * <a>), so the homework link can sit inside it without nesting anchors — nested
 * anchors are invalid HTML and break both keyboard nav and hydration.
 *
 * A locked week still renders: the weekly-release mechanic is only credible if
 * you can see what is coming and when.
 */
export function ModuleCard({
  module: m,
  series,
  pct,
}: {
  module: Module;
  /** Course series key, for the placeholder label. */
  series: string;
  /** Approved homework percentage, when the teacher has marked it. */
  pct?: number;
}) {
  const chip = m.homework ? statusChip(m.submission) : null;
  const lesson = m.lessons.find((l) => l.youtube_id) ?? m.lessons[0];
  const watchable = Boolean(lesson?.youtube_id);

  return (
    <li
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border bg-card transition-colors",
        m.unlocked ? "border-line hover:border-ink/30" : "border-dashed border-line",
      )}
    >
      {/* ── title strip ── */}
      <div className="flex items-baseline gap-2 px-3 py-2">
        {m.title ? (
          <MixedText
            text={m.title}
            className={cn(
              "line-clamp-1 min-w-0 flex-1 text-sm font-medium leading-snug",
              !m.unlocked && "text-muted-foreground",
            )}
          />
        ) : (
          /* moduleTitle() returns "" for the TFP rows — they carry no title
             beyond a number. The week label carries the strip alone. */
          <span className="min-w-0 flex-1" />
        )}
        <span className="shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
          Week {m.weekNumber}
        </span>
      </div>

      <Poster module={m} series={series} />

      {/* ── actions ── */}
      {m.unlocked && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          {lesson && (
            /* Stretched overlay: makes the whole card the lesson link without
               wrapping the homework link in an anchor. */
            <Link
              href={`/lessons/${lesson.id}`}
              className="text-xs text-muted-foreground transition-colors before:absolute before:inset-0 hover:text-foreground"
            >
              <span aria-hidden>▸</span> {watchable ? "Watch" : "Details"}
            </Link>
          )}

          <span className="ml-auto flex items-center gap-2">
            {m.homework?.due_at && !m.submission && (
              <CountdownChip dueAt={m.homework.due_at} />
            )}

            {m.homework && (
              <Link
                href={`/homework/${m.homework.number}`}
                /* relative + z-10 lifts this above the stretched overlay above. */
                className="relative z-10 inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs transition-colors hover:border-ink/30"
              >
                <span>
                  {m.homework.series === "tfp" ? "TFP" : "HW"}{" "}
                  {m.homework.number > 100 ? m.homework.number - 100 : m.homework.number}
                </span>
                {chip && (
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 font-medium",
                      chip.tone === "ok" && "bg-ok/12 text-ok",
                      chip.tone === "warn" && "bg-warn/12 text-warn",
                      chip.tone === "ink" && "bg-muted text-foreground",
                      chip.tone === "muted" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {chip.label}
                    {m.submission === "approved" && pct !== undefined && (
                      <span className="ml-1 tabular-nums">{Math.round(pct)}%</span>
                    )}
                  </span>
                )}
              </Link>
            )}
          </span>
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. (Nothing imports `ModuleCard` yet — this only proves the file typechecks.)

- [ ] **Step 3: Commit**

```bash
git add web/src/components/app/module-card.tsx
git commit -m "feat(courses): ModuleCard — thumbnail card for a week"
```

---

## Task 3: Grid layout on the course page

**Files:**
- Modify: `web/src/app/(student)/courses/[term]/[series]/page.tsx:61-86`

- [ ] **Step 1: Swap the import**

In `web/src/app/(student)/courses/[term]/[series]/page.tsx`, change line 6 from:

```tsx
import { ModuleRow } from "@/components/app/module-row";
```

to:

```tsx
import { ModuleCard } from "@/components/app/module-card";
```

- [ ] **Step 2: Replace the list with a grid**

Replace the whole `<ul>…</ul>` block (lines 61–86) with:

```tsx
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {course.modules.map((m) => (
          <ModuleCard
            key={m.weekId}
            module={m}
            series={course.series}
            pct={m.homework ? pctByHomeworkId.get(m.homework.id) : undefined}
          />
        ))}

        {nextUnlock && (
          <li className="flex items-center justify-center rounded-xl border border-dashed border-line p-6">
            <p className="text-center text-sm text-muted-foreground">
              Week {nextUnlock.number} unlocks{" "}
              <span className="tabular-nums text-foreground">
                {new Date(nextUnlock.unlockAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                })}
              </span>
              {term.lockedWeeks.length > 1 &&
                `, then ${term.lockedWeeks.length - 1} more after that`}
              .
            </p>
          </li>
        )}
      </ul>
```

The grid breakpoints match `/courses` and `/courses/[term]`, which both already use `md:grid-cols-2 lg:grid-cols-3`. Do not invent new ones.

- [ ] **Step 3: Verify it compiles and lints**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: `tsc` clean. `npm run lint` reports **exactly the 6 pre-existing errors and 3 warnings** described in "Lint baseline" above — no more. Compare the count; if it rises, the new code introduced it and you must fix it. Do not fix the pre-existing six: they are in files this plan does not touch, and cleaning them here would bury the real diff.

- [ ] **Step 4: Commit**

```bash
git add "web/src/app/(student)/courses/[term]/[series]/page.tsx"
git commit -m "feat(courses): render modules as a card grid"
```

---

## Task 4: Delete `ModuleRow`, verify in the browser

**Files:**
- Delete: `web/src/components/app/module-row.tsx`

- [ ] **Step 1: Confirm nothing imports it**

Run: `cd "/Users/ibrahimramadan/BSMS Tajweed app" && grep -rn "module-row\|ModuleRow" web/src/`
Expected: **no output.** If anything is listed, fix that import first — do not delete a file still in use.

- [ ] **Step 2: Delete it**

```bash
git rm web/src/components/app/module-row.tsx
```

- [ ] **Step 3: Full check**

Run: `cd web && npm test && npm run lint && npm run build`
Expected: all 175 tests pass (the `tree.ts` suite — 44 of them — must be green and **unchanged** — if it goes red, the change has leaked past presentation; stop and investigate rather than editing the test), lint clean, build succeeds.

- [ ] **Step 4: Look at it in the browser**

The dev server is on http://localhost:3000. Sign in as a student and open a course — `/courses/1/tajweed` and `/courses/1/umm_al_kitab` both have content.

At this point **no video ids are loaded yet**, so every card should show the *placeholder* state. That is the expected result, not a bug — it is also the only chance to verify the placeholder before real thumbnails hide it.

Check, at 375px, 768px and 1280px wide:

- [ ] placeholder tile renders at 16:9, grid rows stay even
- [ ] title strip is one line; a long title ellipsises and the `Week N` label stays put
- [ ] a TFP card (`/courses/3/tfp`) shows the week label alone, with no empty gap
- [ ] a locked week shows the lock and unlock date
- [ ] clicking the card body goes to `/lessons/…`; clicking the HW chip goes to `/homework/…`
- [ ] tab into a card: lesson link then homework chip both reachable, focus visible
- [ ] the page body does not scroll horizontally at 375px

Take a screenshot at one breakpoint and look at it. A blank frame is a failure.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(courses): drop ModuleRow, superseded by ModuleCard"
```

---

## Task 5: Backfill the video ids — **requires user confirmation**

**Files:**
- Create: `web/supabase/migrations/0008_lesson_videos.sql`

> **STOP.** This migration writes to the **live hosted Supabase**. There is no local database and no staging copy. Do not run Step 3 until the user has explicitly confirmed. Writing the file (Steps 1–2) is safe and does nothing on its own.

- [ ] **Step 1: Write the migration**

Create `web/supabase/migrations/0008_lesson_videos.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- Attach the real YouTube videos to their lessons.
--
-- 0002 seeded lessons with youtube_id null "until the channel re-uploads
-- after summer". It has: @bsmstajweed carries Tajweed Ep. 1-15 and Ummul
-- Kitab Ep. 1-9, which map 1:1 by episode number onto the 24 lessons below.
--
-- Rows are addressed by (series, term, week), NOT by title. Live titles have
-- already drifted from what 0003 wrote (colon vs em dash, from a later Forms
-- re-import), so a title match would silently update nothing. Term/week
-- placement has never moved — 0004 and 0005 shift dates only.
--
-- This also OVERWRITES Tajweed 1, which was left pointing at M7lc1UVf-VE:
-- Google's IFrame-API demo video, from building the player. It has been live
-- to students.
--
-- Not covered, deliberately: Tajweed 16-21 (T3 W1-6) and TFP 1-7 (T3 W1-7)
-- are not on the public channel. If they are unlisted rather than deleted
-- they need only their ids — unlisted videos embed fine, private ones cannot
-- be embedded at all. Add them via the teacher curriculum page, or a 0009.
--
-- Idempotent: a plain UPDATE, safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

update lessons l
set youtube_id = v.youtube_id
from (values
    ('tajweed',      1, 1, 'UIFFYPHwD40'),  -- Ep. 1  Definitions, Importance and Mistakes
    ('tajweed',      1, 2, 'i4lO6TQUHBM'),  -- Ep. 2  Ghunna: noon & meem with shaddah
    ('tajweed',      1, 3, 'joORVl0SsiY'),  -- Ep. 3  Ghunna: Idhaar Halqi
    ('tajweed',      1, 4, 'X-AOGhqilMw'),  -- Ep. 4  Ghunna: Idghaam
    ('tajweed',      1, 5, 'SiA13h8tWCQ'),  -- Ep. 5  Ghunna: Iqlaab
    ('tajweed',      1, 6, '0WB9vRZI68c'),  -- Ep. 6  Ghunna: Ikhfaa' haqiqi
    ('tajweed',      1, 7, 'fZloAEMwjGw'),  -- Ep. 7  Ghunna: summary of noon sakin/tanween
    ('tajweed',      1, 8, '902KsFgLmOo'),  -- Ep. 8  Ghunna: meem sakin
    ('tajweed',      2, 1, 'Holxa6V-1uw'),  -- Ep. 9  Sifaat: Huruf Al-Isti'laa'
    ('tajweed',      2, 2, '4n-qp1FHYb4'),  -- Ep. 10 Sifaat: The Rule of Laam
    ('tajweed',      2, 3, 'QQQC9ooiXm8'),  -- Ep. 11 Sifaat: The Rule of Raa
    ('tajweed',      2, 4, 'R3D_vnqqTpA'),  -- Ep. 12 Sifaat: Qalqala
    ('tajweed',      2, 5, 'KpDEZZLTkPE'),  -- Ep. 13 Sifaat: common mistakes with Hams
    ('tajweed',      2, 6, 'P0Y_ZZb3T9g'),  -- Ep. 14 Sifaat: Hamzatul wasl
    ('tajweed',      2, 7, 'pxspBVHr2is'),  -- Ep. 15 Sifaat: meeting of 2 sukoons
    ('umm_al_kitab', 1, 1, 'uvLp-T3yXLo'),  -- Ep. 1  Names, virtues, importance of Al-Fatihah
    ('umm_al_kitab', 1, 2, 'j1lODTg5EZg'),  -- Ep. 2  Al-isti'adha
    ('umm_al_kitab', 1, 3, 'Huk0ODM5RfE'),  -- Ep. 3  Al-basmala
    ('umm_al_kitab', 1, 4, 'IQe9A3k03Ho'),  -- Ep. 4  Verse 2
    ('umm_al_kitab', 1, 5, 'Ez0qv8ZxRmo'),  -- Ep. 5  Verse 3
    ('umm_al_kitab', 1, 6, 'KlEpXF2ypjo'),  -- Ep. 6  Verse 4
    ('umm_al_kitab', 1, 7, '7FZbyTxvqIE'),  -- Ep. 7  Verse 5
    ('umm_al_kitab', 1, 8, 'cAbOUFPGjxc'),  -- Ep. 8  Verse 6
    ('umm_al_kitab', 1, 9, 'WC5ZAgH8YOg')   -- Ep. 9  Verse 7
  ) as v(series, term_id, week_number, youtube_id)
join weeks w
  on w.term_id = v.term_id and w.number = v.week_number
where l.week_id = w.id
  and l.series = v.series;
```

- [ ] **Step 2: Ask the user to confirm**

Show them: this writes to the live database, it sets 24 rows, and it overwrites the stray Google demo video on Tajweed 1. Wait for an explicit yes.

- [ ] **Step 3: Apply it**

Run: `cd "/Users/ibrahimramadan/BSMS Tajweed app" && npx --prefix web tsx execution/apply_migration.ts web/supabase/migrations/0008_lesson_videos.sql`
Expected: `ok    0008_lesson_videos.sql`

If it prints `skip … already applied`, it has run before — check the verification below before reaching for `--force`.

- [ ] **Step 4: Verify — do not skip this**

A migration that updates 0 rows and one that updates 24 look identical from the outside. `LEARNINGS.md` already records this exact silent-success failure mode from the eval harness. Prove it landed.

Create `/private/tmp/claude-502/-Users-ibrahimramadan-BSMS-Tajweed-app/4922f403-65b4-4fc9-a26d-3f90170dfa10/scratchpad/verify_videos.ts`:

```typescript
import { readFileSync } from "node:fs";

const ROOT = "/Users/ibrahimramadan/BSMS Tajweed app";
const EXPECTED = new Set([
  "UIFFYPHwD40","i4lO6TQUHBM","joORVl0SsiY","X-AOGhqilMw","SiA13h8tWCQ",
  "0WB9vRZI68c","fZloAEMwjGw","902KsFgLmOo","Holxa6V-1uw","4n-qp1FHYb4",
  "QQQC9ooiXm8","R3D_vnqqTpA","KpDEZZLTkPE","P0Y_ZZb3T9g","pxspBVHr2is",
  "uvLp-T3yXLo","j1lODTg5EZg","Huk0ODM5RfE","IQe9A3k03Ho","Ez0qv8ZxRmo",
  "KlEpXF2ypjo","7FZbyTxvqIE","cAbOUFPGjxc","WC5ZAgH8YOg",
]);

async function main() {
  const env = Object.fromEntries(
    readFileSync(`${ROOT}/.env`, "utf8").split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
  );

  const res = await fetch(
    "https://api.supabase.com/v1/projects/ssqeakiutclbiwizrchh/database/query",
    { method: "POST",
      headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `
        select l.series, w.term_id, w.number as week, l.youtube_id
        from lessons l join weeks w on w.id = l.week_id
        where l.youtube_id is not null
        order by l.series, w.term_id, w.number` }) },
  );
  const rows: { series: string; term_id: number; week: number; youtube_id: string }[] = await res.json();
  if (!res.ok) { console.error("query failed", rows); process.exit(1); }

  const problems: string[] = [];
  if (rows.length !== 24) problems.push(`expected 24 lessons with a video, got ${rows.length}`);
  for (const r of rows) {
    if (!EXPECTED.has(r.youtube_id)) {
      problems.push(`unexpected id ${r.youtube_id} on ${r.series} T${r.term_id} W${r.week}`);
    }
  }
  const seen = new Set(rows.map((r) => r.youtube_id));
  for (const id of EXPECTED) if (!seen.has(id)) problems.push(`missing id ${id}`);

  // every poster must actually resolve, or cards render broken
  for (const r of rows) {
    const head = await fetch(`https://i.ytimg.com/vi/${r.youtube_id}/hqdefault.jpg`, { method: "HEAD" });
    if (!head.ok) problems.push(`thumbnail ${head.status} for ${r.youtube_id}`);
  }

  console.log(`${rows.length} lessons carry a video`);
  if (problems.length) { console.error("FAILED:"); for (const p of problems) console.error("  " + p); process.exit(1); }
  console.log("OK — all 24 ids correct, all thumbnails resolve");
}
main();
```

Run: `cd web && npx tsx /private/tmp/claude-502/-Users-ibrahimramadan-BSMS-Tajweed-app/4922f403-65b4-4fc9-a26d-3f90170dfa10/scratchpad/verify_videos.ts`
Expected: `24 lessons carry a video` then `OK — all 24 ids correct, all thumbnails resolve`.

If it reports `unexpected id M7lc1UVf-VE`, the migration did not overwrite Tajweed 1 — investigate, do not paper over it.

- [ ] **Step 5: Look at the real thumbnails**

Reload `/courses/1/tajweed` and `/courses/1/umm_al_kitab`.

- [ ] real posters render, cropped clean — **no black letterbox bars top/bottom**
- [ ] `/courses/3/tfp` still shows placeholders (correct — no videos exist)
- [ ] open a lesson: the player loads the right video, not the Google demo

- [ ] **Step 6: Commit**

```bash
git add web/supabase/migrations/0008_lesson_videos.sql
git commit -m "feat(curriculum): attach the 24 real lesson videos"
```

---

## Task 6: Record what was learned

**Files:**
- Modify: `LEARNINGS.md`

- [ ] **Step 1: Add the cross-cutting findings**

Two things here bite any future task, not just this one. Add under "Reusable patterns / gotchas" in `LEARNINGS.md`:

```markdown
- [2026-08-06] YouTube **private** videos cannot be embedded anywhere — no key, link format or invite makes them work in an iframe. **Unlisted** embeds fine and is hidden from the channel's Videos tab and search. Any course video that shouldn't be public must be Unlisted, never Private. (source: course video grid)
- [2026-08-06] Address data migrations by stable position — here `(series, term, week)` — never by title match. Live lesson titles had already drifted from what the `0003` seed wrote (colon vs em dash, from a later Forms re-import), so a title-matched UPDATE would have silently updated nothing and reported success. (source: 0008_lesson_videos)
- [2026-08-06] Probe the live DB read-only BEFORE writing a data migration. Doing so here found `lessons.youtube_id` on Tajweed 1 set to `M7lc1UVf-VE` — Google's IFrame-API demo video, left from building the player and live to students. No test covered it because no test asserts on production data. (source: 0008_lesson_videos)
- [2026-08-06] YouTube `hqdefault.jpg` always exists (480×360, 12.5% letterbox bars); `maxresdefault.jpg` is true 16:9 but only exists for HD-sourced uploads. Use hqdefault + `object-cover` in a 16:9 box — the crop removes exactly the bars. (source: course video grid)
- [2026-08-06] **`grep` finds nothing in `web/src/lib/curriculum/tree.ts`** — it uses a raw NUL byte as its composite-key separator (`` `${termId}\0${series}` ``), so `file` calls it "data" and grep treats it as binary and prints no matches *without any error*. Use `grep -a` on it. This is a silent false negative: it can make you conclude a type or function doesn't exist when it does. (The code is correct and its 44 tests pass — it is a search-ergonomics trap, not a bug. Note the Read tool renders the NUL as a space.) (source: course video grid)
- [2026-08-06] macOS/BSD `grep` does not support `\s` in `-E` patterns — it matches nothing instead of erroring. Use `[[:space:]]`. Another silent false negative when verifying that symbols exist. (source: course video grid)
```

- [ ] **Step 2: Commit**

```bash
git add LEARNINGS.md
git commit -m "docs: record video-embed and data-migration learnings"
```

---

## Done when

- [ ] `cd web && npm test && npm run lint && npm run build` all pass
- [ ] `tree.ts` tests unchanged and green
- [ ] 24 lessons carry a video; the verify script prints OK
- [ ] Tajweed 1 no longer points at Google's demo video
- [ ] `/courses/[term]/[series]` renders a card grid at all three breakpoints, with real posters where videos exist and placeholders where they don't
- [ ] `ModuleRow` is gone and nothing references it

## Follow-up, not in this plan

Recovering the 13 missing video ids (Tajweed 16–21, TFP 1–7) is a **content task for the channel owner** — YouTube Studio → Content → filter Unlisted → copy each link. They can then be added through the teacher curriculum page one at a time, or as a `0009` migration in the same shape as `0008`. The placeholder is built so this needs no code change.
