# Student Hifz Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the student `/hifz` page as a journey: juz-framed hero with hizb
blocks, a winding path of surah nodes with hizb-check milestones, and a
most-recent-first record of passes + teacher comments.

**Architecture:** Read-only redesign — zero database changes. Two new pure-logic
modules (`hizb.ts` static mushaf structure + derivations, `surah-meta.ts` static surah
facts) feed three new server components (`hifz-hero`, `hifz-journey`, `hifz-record`)
composed by a rewritten `page.tsx`. The only interactive element is a native
`<details>` in the record — no client JS. Spec:
`docs/superpowers/specs/2026-08-06-student-hifz-journey-design.md`.

**Tech Stack:** Next.js App Router (server components), Tailwind v4 tokens from
`globals.css` (`ok/warn/danger`, `ink-2`, `line`, `bg-card`, `ar-ui`), vitest for the
pure logic. All paths below are relative to `web/`.

**Conventions you must follow** (from the existing codebase):
- Server pages: `async function`, `export const dynamic = "force-dynamic"`,
  `currentProfile()` / `supabaseServer()` from `@/lib/supabase/server`.
- Arabic text always gets `dir="rtl" lang="ar" className="ar-ui"`.
- Cards are `rounded-lg border border-line bg-card`.
- `cn()` from `@/lib/utils` for conditional classes.
- Run all commands from `web/`. Repo root is one level up (`../`) — note the space in
  the absolute path (`/Users/ibrahimramadan/BSMS Tajweed app`): always quote it.
- `web/AGENTS.md` warns this Next.js version may differ from your training data —
  stick to the patterns already used by the existing pages (they are known-good).

---

### Task 1: Hizb structure — bounds, `hizbOf`, `juzOf`, `assumedPassed`

**Files:**
- Create: `src/lib/hifz/hizb.ts`
- Test: `src/lib/hifz/hizb.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/hifz/hizb.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hizbOf, juzOf, assumedPassed } from "./hizb";
import type { Surah } from "./pace";

/** The real run: order_index 1..43 = surah 114 down to 72. */
export const RUN: Surah[] = Array.from({ length: 43 }, (_, i) => ({
  number: 114 - i,
  order_index: i + 1,
  name_ar: `س${114 - i}`,
  name_en: `S${114 - i}`,
}));

describe("hizbOf — standard mushaf bounds", () => {
  it("hizb 60 runs Al-A'la (87) to An-Nas (114)", () => {
    expect(hizbOf(114)).toBe(60);
    expect(hizbOf(87)).toBe(60);
    expect(hizbOf(86)).toBe(59); // At-Tariq is hizb 59, NOT 60
  });
  it("hizb 59 runs An-Naba (78) to At-Tariq (86)", () => {
    expect(hizbOf(78)).toBe(59);
    expect(hizbOf(77)).toBe(58); // Al-Mursalat starts hizb 58's range
  });
  it("hizb 58 runs Al-Jinn (72) to Al-Mursalat (77) — the run ends on its boundary", () => {
    expect(hizbOf(72)).toBe(58);
    expect(hizbOf(71)).toBe(57); // Nuh — outside the programme
  });
  it("returns null outside the mapped ranges", () => {
    expect(hizbOf(66)).toBeNull();
  });
});

describe("juzOf", () => {
  it("Juz 'Amma is 78–114, Tabarak is 67–77", () => {
    expect(juzOf(114)).toBe(30);
    expect(juzOf(78)).toBe(30);
    expect(juzOf(77)).toBe(29);
    expect(juzOf(67)).toBe(29);
    expect(juzOf(66)).toBeNull();
  });
});

describe("assumedPassed", () => {
  it("a fresh student's set is just their records", () => {
    const passed = new Set([114, 113]);
    expect(assumedPassed(RUN, RUN, passed)).toEqual(new Set([114, 113]));
  });
  it("a returning student's pre-start surahs count as passed", () => {
    const list = RUN.slice(10); // starts at surah 104
    const out = assumedPassed(RUN, list, new Set([104]));
    expect(out.has(114)).toBe(true);  // done last year
    expect(out.has(105)).toBe(true);
    expect(out.has(104)).toBe(true);  // this year's record
    expect(out.has(103)).toBe(false); // not yet passed
    expect(out.size).toBe(11);
  });
  it("an empty list adds nothing", () => {
    expect(assumedPassed(RUN, [], new Set([114]))).toEqual(new Set([114]));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hifz/hizb.test.ts`
Expected: FAIL — `Cannot find module './hizb'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `src/lib/hifz/hizb.ts`:

```ts
/**
 * Hizb + juz structure for the BSMS memorisation run (An-Nas 114 → Al-Jinn 72).
 *
 * Boundaries follow the standard mushaf division: hizb 60 starts at Al-A'la
 * (87), 59 at An-Naba (78), 58 at Al-Jinn (72) — so the run is exactly hizbs
 * 60+59+58 and ends on a hizb boundary. The hizb check itself is NOT recorded
 * in the DB; everything here is derived from passed surahs, so the UI says
 * "ready for your check", never "check passed" (a hizb_checks table is the
 * future teacher-side hook).
 */
import type { Surah } from "./pace";

export type HizbRange = { hizb: number; from: number; to: number };

/** Surah-number ranges, in memorisation order (hizb 60 first). */
export const HIZB_BOUNDS: HizbRange[] = [
  { hizb: 60, from: 87, to: 114 },
  { hizb: 59, from: 78, to: 86 },
  { hizb: 58, from: 72, to: 77 },
  { hizb: 57, from: 67, to: 71 },
];

export const JUZ_BOUNDS = [
  { juz: 30, from: 78, to: 114, name_en: "Juz 'Amma", name_ar: "عمّ" },
  { juz: 29, from: 67, to: 77, name_en: "Juz Tabarak", name_ar: "تبارك" },
] as const;

export const hizbOf = (n: number): number | null =>
  HIZB_BOUNDS.find((h) => n >= h.from && n <= h.to)?.hizb ?? null;

export const juzOf = (n: number): number | null =>
  JUZ_BOUNDS.find((j) => n >= j.from && n <= j.to)?.juz ?? null;

/**
 * Records only exist from the student's start_surah onward. A returning
 * student's earlier surahs (done in a previous year) count as passed for
 * every derived number on this page.
 */
export function assumedPassed(
  allSurahs: Surah[],
  list: Surah[],
  passed: Set<number>,
): Set<number> {
  const out = new Set(passed);
  if (list.length === 0) return out;
  const startIdx = list[0].order_index;
  for (const s of allSurahs) if (s.order_index < startIdx) out.add(s.number);
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/hifz/hizb.test.ts`
Expected: PASS (3 describe blocks, 8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hifz/hizb.ts src/lib/hifz/hizb.test.ts
git commit -m "feat(hifz): mushaf hizb/juz bounds + returning-student passed set"
```

---

### Task 2: Derivations — `hizbBlocks`, `checkStatus`, `juzProgress`, `rowPlan`

**Files:**
- Modify: `src/lib/hifz/hizb.ts` (append)
- Modify: `src/lib/hifz/hizb.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Append to `src/lib/hifz/hizb.test.ts` (RUN fixture already defined there):

```ts
import { hizbBlocks, checkStatus, juzProgress, rowPlan } from "./hizb";

const passedFirstN = (n: number) => new Set(RUN.slice(0, n).map((s) => s.number));

describe("hizbBlocks", () => {
  it("splits the run into 60 (28), 59 (9), 58 (6)", () => {
    const blocks = hizbBlocks(RUN, new Set());
    expect(blocks.map((b) => b.hizb)).toEqual([60, 59, 58]);
    expect(blocks.map((b) => b.surahs.length)).toEqual([28, 9, 6]);
    expect(blocks[0].state).toBe("current");
    expect(blocks[1].state).toBe("upcoming");
  });
  it("marks a fully passed block complete and moves current on", () => {
    const blocks = hizbBlocks(RUN, passedFirstN(28)); // all of hizb 60
    expect(blocks[0].state).toBe("complete");
    expect(blocks[1].state).toBe("current");
    expect(blocks[1].passedCount).toBe(0);
  });
  it("counts partial progress", () => {
    const blocks = hizbBlocks(RUN, passedFirstN(12));
    expect(blocks[0].passedCount).toBe(12);
    expect(blocks[0].state).toBe("current");
  });
});

describe("checkStatus", () => {
  it("mid-block: surahs to go until the check", () => {
    expect(checkStatus(hizbBlocks(RUN, passedFirstN(12))))
      .toEqual({ kind: "toGo", hizb: 60, remaining: 16 });
  });
  it("block finished, next untouched: ready for the check", () => {
    expect(checkStatus(hizbBlocks(RUN, passedFirstN(28))))
      .toEqual({ kind: "ready", hizb: 60 });
  });
  it("next block started: back to counting down", () => {
    expect(checkStatus(hizbBlocks(RUN, passedFirstN(29))))
      .toEqual({ kind: "toGo", hizb: 59, remaining: 8 });
  });
  it("whole run passed: done", () => {
    expect(checkStatus(hizbBlocks(RUN, passedFirstN(43)))).toEqual({ kind: "done" });
  });
  it("no blocks: null", () => {
    expect(checkStatus([])).toBeNull();
  });
});

describe("juzProgress", () => {
  it("in Juz 'Amma the denominator is 37", () => {
    const p = juzProgress(RUN, RUN, passedFirstN(12));
    expect(p).toMatchObject({ juz: 30, passed: 12, total: 37 });
  });
  it("in Tabarak the denominator is the run's 6, not the juz's 11", () => {
    const p = juzProgress(RUN, RUN, passedFirstN(38)); // current = surah 76
    expect(p).toMatchObject({ juz: 29, passed: 1, total: 6 });
  });
  it("all passed: reports the final juz complete", () => {
    const p = juzProgress(RUN, RUN, passedFirstN(43));
    expect(p).toMatchObject({ juz: 29, passed: 6, total: 6 });
  });
  it("empty list: null", () => {
    expect(juzProgress(RUN, [], new Set())).toBeNull();
  });
});

describe("rowPlan", () => {
  it("keeps kept rows and collapses hidden runs of 3+", () => {
    expect(rowPlan(8, new Set([0, 1, 7]))).toEqual([
      { kind: "node", index: 0 },
      { kind: "node", index: 1 },
      { kind: "gap", count: 5 },
      { kind: "node", index: 7 },
    ]);
  });
  it("renders short hidden runs (<3) as nodes — a gap row would be sillier", () => {
    expect(rowPlan(4, new Set([0, 3]))).toEqual([
      { kind: "node", index: 0 },
      { kind: "node", index: 1 },
      { kind: "node", index: 2 },
      { kind: "node", index: 3 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hifz/hizb.test.ts`
Expected: FAIL — `hizbBlocks` (etc.) has no exported member.

- [ ] **Step 3: Append the implementation**

Append to `src/lib/hifz/hizb.ts`:

```ts
export type HizbBlockState = "complete" | "current" | "upcoming";
export type HizbBlock = {
  hizb: number;
  surahs: Surah[]; // run order
  passedCount: number;
  state: HizbBlockState;
};

/** Blocks over the FULL run — the hero bars show all of them regardless of
 *  the student's yearly target. Pass the `assumedPassed` set. */
export function hizbBlocks(allSurahs: Surah[], passed: Set<number>): HizbBlock[] {
  const ordered = [...allSurahs].sort((a, b) => a.order_index - b.order_index);
  const groups = new Map<number, Surah[]>();
  for (const s of ordered) {
    const h = hizbOf(s.number);
    if (h === null) continue;
    groups.set(h, [...(groups.get(h) ?? []), s]);
  }
  const blocks: HizbBlock[] = [...groups.entries()].map(([hizb, surahs]) => ({
    hizb,
    surahs,
    passedCount: surahs.filter((s) => passed.has(s.number)).length,
    state: "upcoming",
  }));
  let currentSeen = false;
  for (const b of blocks) {
    if (b.passedCount === b.surahs.length) b.state = "complete";
    else if (!currentSeen) {
      b.state = "current";
      currentSeen = true;
    }
  }
  return blocks;
}

export type CheckStatus =
  | { kind: "toGo"; hizb: number; remaining: number }
  | { kind: "ready"; hizb: number }
  | { kind: "done" }
  | null;

/** The hero's footer line. "ready" = block finished but its check not yet
 *  presumed done (the next block is untouched). Derived, never authoritative. */
export function checkStatus(blocks: HizbBlock[]): CheckStatus {
  if (blocks.length === 0) return null;
  if (blocks.every((b) => b.state === "complete")) return { kind: "done" };
  const cur = blocks.find((b) => b.state === "current")!;
  const prev = blocks[blocks.indexOf(cur) - 1];
  if (cur.passedCount === 0 && prev?.state === "complete")
    return { kind: "ready", hizb: prev.hizb };
  return { kind: "toGo", hizb: cur.hizb, remaining: cur.surahs.length - cur.passedCount };
}

export type JuzProgress = {
  juz: number;
  name_en: string;
  name_ar: string;
  passed: number;
  total: number;
};

/** Progress through the juz the current surah sits in. Denominator = that
 *  juz's surahs within the run (37 for 'Amma; 6 for Tabarak, since hizb 57
 *  is outside the programme). Pass the `assumedPassed` set. */
export function juzProgress(
  allSurahs: Surah[],
  list: Surah[],
  passed: Set<number>,
): JuzProgress | null {
  if (list.length === 0) return null;
  const current = list.find((s) => !passed.has(s.number)) ?? list[list.length - 1];
  const juz = juzOf(current.number);
  if (juz === null) return null;
  const bound = JUZ_BOUNDS.find((j) => j.juz === juz)!;
  const inJuz = allSurahs.filter((s) => s.number >= bound.from && s.number <= bound.to);
  return {
    juz,
    name_en: bound.name_en,
    name_ar: bound.name_ar,
    passed: inJuz.filter((s) => passed.has(s.number)).length,
    total: inJuz.length,
  };
}

export type PathRow = { kind: "node"; index: number } | { kind: "gap"; count: number };

/** Which of `count` rows to render: kept rows as nodes, contiguous hidden
 *  runs of 3+ collapsed to a "… N more surahs" gap row. */
export function rowPlan(count: number, keep: Set<number>): PathRow[] {
  const rows: PathRow[] = [];
  let i = 0;
  while (i < count) {
    if (keep.has(i)) {
      rows.push({ kind: "node", index: i });
      i++;
      continue;
    }
    let j = i;
    while (j < count && !keep.has(j)) j++;
    if (j - i >= 3) rows.push({ kind: "gap", count: j - i });
    else for (let k = i; k < j; k++) rows.push({ kind: "node", index: k });
    i = j;
  }
  return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/hifz/hizb.test.ts`
Expected: PASS — all Task 1 + Task 2 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hifz/hizb.ts src/lib/hifz/hizb.test.ts
git commit -m "feat(hifz): hizb blocks, check status, juz progress, path row plan"
```

---

### Task 3: Static surah metadata + date formatter

**Files:**
- Create: `src/lib/hifz/surah-meta.ts`
- Create: `src/lib/format.ts`
- Test: `src/lib/hifz/surah-meta.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/hifz/surah-meta.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SURAH_META } from "./surah-meta";

describe("SURAH_META", () => {
  it("covers every surah in the run (72–114), nothing else", () => {
    const keys = Object.keys(SURAH_META).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual(Array.from({ length: 43 }, (_, i) => 72 + i));
  });
  it("spot checks against the mushaf", () => {
    expect(SURAH_META[114]).toEqual({ ayahs: 6, meaning: "Mankind" });
    expect(SURAH_META[112]).toEqual({ ayahs: 4, meaning: "The Sincerity" });
    expect(SURAH_META[78]).toEqual({ ayahs: 40, meaning: "The Great News" });
    expect(SURAH_META[72]).toEqual({ ayahs: 28, meaning: "The Jinn" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/hifz/surah-meta.test.ts`
Expected: FAIL — cannot resolve `./surah-meta`.

- [ ] **Step 3: Write the data**

Create `src/lib/hifz/surah-meta.ts`. Ayah counts are the standard Kufan count (the
one every mushaf prints); meanings are the common concise English renderings:

```ts
/** Static mushaf facts for the surahs in the memorisation run (72–114).
 *  Not in the DB on purpose — this never changes. */
export const SURAH_META: Record<number, { ayahs: number; meaning: string }> = {
  72: { ayahs: 28, meaning: "The Jinn" },
  73: { ayahs: 20, meaning: "The Enshrouded One" },
  74: { ayahs: 56, meaning: "The Cloaked One" },
  75: { ayahs: 40, meaning: "The Resurrection" },
  76: { ayahs: 31, meaning: "Man" },
  77: { ayahs: 50, meaning: "Those Sent Forth" },
  78: { ayahs: 40, meaning: "The Great News" },
  79: { ayahs: 46, meaning: "Those Who Pull Out" },
  80: { ayahs: 42, meaning: "He Frowned" },
  81: { ayahs: 29, meaning: "The Folding Up" },
  82: { ayahs: 19, meaning: "The Cleaving" },
  83: { ayahs: 36, meaning: "Those Who Deal in Fraud" },
  84: { ayahs: 25, meaning: "The Splitting Asunder" },
  85: { ayahs: 22, meaning: "The Constellations" },
  86: { ayahs: 17, meaning: "The Night Comer" },
  87: { ayahs: 19, meaning: "The Most High" },
  88: { ayahs: 26, meaning: "The Overwhelming" },
  89: { ayahs: 30, meaning: "The Dawn" },
  90: { ayahs: 20, meaning: "The City" },
  91: { ayahs: 15, meaning: "The Sun" },
  92: { ayahs: 21, meaning: "The Night" },
  93: { ayahs: 11, meaning: "The Morning Brightness" },
  94: { ayahs: 8, meaning: "The Relief" },
  95: { ayahs: 8, meaning: "The Fig" },
  96: { ayahs: 19, meaning: "The Clot" },
  97: { ayahs: 5, meaning: "The Night of Decree" },
  98: { ayahs: 8, meaning: "The Clear Evidence" },
  99: { ayahs: 8, meaning: "The Earthquake" },
  100: { ayahs: 11, meaning: "The Chargers" },
  101: { ayahs: 11, meaning: "The Striking Hour" },
  102: { ayahs: 8, meaning: "Rivalry in Increase" },
  103: { ayahs: 3, meaning: "The Time" },
  104: { ayahs: 9, meaning: "The Slanderer" },
  105: { ayahs: 5, meaning: "The Elephant" },
  106: { ayahs: 4, meaning: "Quraysh" },
  107: { ayahs: 7, meaning: "Small Kindnesses" },
  108: { ayahs: 3, meaning: "Abundance" },
  109: { ayahs: 6, meaning: "The Disbelievers" },
  110: { ayahs: 3, meaning: "The Help" },
  111: { ayahs: 5, meaning: "The Palm Fibre" },
  112: { ayahs: 4, meaning: "The Sincerity" },
  113: { ayahs: 5, meaning: "The Daybreak" },
  114: { ayahs: 6, meaning: "Mankind" },
};
```

Create `src/lib/format.ts`:

```ts
/** "2026-09-19" → "19 Sept" (en-GB short month). Used wherever a pass date shows. */
export const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(iso),
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/hifz/surah-meta.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hifz/surah-meta.ts src/lib/hifz/surah-meta.test.ts src/lib/format.ts
git commit -m "feat(hifz): static surah metadata (ayahs, meanings) and day formatter"
```

---

### Task 4: Hero strip component

**Files:**
- Create: `src/components/app/hifz-hero.tsx`

No unit test — this repo unit-tests pure logic only; components are verified by
typecheck now and the manual pass in Task 7.

- [ ] **Step 1: Write the component**

Create `src/components/app/hifz-hero.tsx`:

```tsx
import { cn } from "@/lib/utils";
import type { PaceStatus } from "@/lib/hifz/pace";
import type { CheckStatus, HizbBlock, JuzProgress } from "@/lib/hifz/hizb";

/** Top card of /hifz: current surah, juz-framed ring, hizb block bars, and
 *  the distance to the next hizb check. Everything is precomputed by the
 *  page; this only renders. */
export function HifzHero({
  nameEn,
  nameAr,
  meta,
  juz,
  blocks,
  pace,
  complete,
  check,
}: {
  nameEn: string;
  nameAr: string;
  meta?: { ayahs: number; meaning: string };
  juz: JuzProgress | null;
  blocks: HizbBlock[];
  pace: PaceStatus | null;
  complete: boolean; // the student's own list is fully passed
  check: CheckStatus;
}) {
  const pct = juz && juz.total > 0 ? Math.round((juz.passed / juz.total) * 100) : 0;
  return (
    <section className="rounded-lg border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {complete ? "Memorisation target complete" : "Now memorising"}
          </p>
          <p dir="rtl" lang="ar" className="ar-ui mt-1 text-3xl">
            {nameAr}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {nameEn}
            {meta && (
              <>
                {" "}· &ldquo;{meta.meaning}&rdquo; · {meta.ayahs} ayahs
              </>
            )}
          </p>
        </div>

        {juz && (
          <div className="flex items-center gap-3">
            <div
              className="grid size-14 shrink-0 place-items-center rounded-full"
              style={{ background: `conic-gradient(var(--ok) ${pct}%, var(--muted) 0)` }}
            >
              <div className="grid size-11 place-items-center rounded-full bg-card text-[11px] font-medium tabular-nums text-ok">
                {juz.passed}/{juz.total}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {juz.name_en}{" "}
                <span dir="rtl" lang="ar" className="ar-ui normal-case">
                  {juz.name_ar}
                </span>
              </p>
              <p className="text-sm">
                <span className="font-medium tabular-nums">
                  {juz.passed} of {juz.total}
                </span>{" "}
                surahs
              </p>
              {pace && (
                <span
                  className={cn(
                    "inline-block rounded-md px-2 py-0.5 text-xs font-medium",
                    pace === "ok" && "bg-ok/12 text-ok",
                    pace === "warn" && "bg-warn/12 text-warn",
                    pace === "danger" && "bg-danger/12 text-danger",
                  )}
                >
                  {pace === "ok" ? "ahead of pace" : pace === "warn" ? "on pace" : "behind pace"}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* hizb blocks — widths proportional to surah counts (28/9/6) */}
      <div className="mt-5 flex gap-1.5">
        {blocks.map((b) => (
          <div key={b.hizb} className="min-w-0" style={{ flexGrow: b.surahs.length, flexBasis: 0 }}>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-ok"
                style={{ width: `${b.surahs.length ? (b.passedCount / b.surahs.length) * 100 : 0}%` }}
              />
            </div>
            <p
              className={cn(
                "mt-1 truncate text-[10px] tabular-nums",
                b.state === "upcoming" ? "text-muted-foreground/60" : "text-muted-foreground",
              )}
            >
              Hizb {b.hizb} ·{" "}
              {b.state === "upcoming" ? b.surahs.length : `${b.passedCount}/${b.surahs.length}`}
            </p>
          </div>
        ))}
      </div>

      {/* When the student's own list is done, celebrate — even if their target
          ends mid-hizb and the run's next check is technically still ahead. */}
      {complete ? (
        <p className="mt-3 text-sm font-medium text-ok">Target complete — masha&rsquo;Allah.</p>
      ) : check && (
        <p className="mt-3 text-sm">
          {check.kind === "toGo" && (
            <>
              <span className="font-medium tabular-nums">
                {check.remaining} surah{check.remaining === 1 ? "" : "s"}
              </span>{" "}
              until your <span className="font-medium">Hizb {check.hizb} check</span> — presenting
              the whole hizb to your teacher.
            </>
          )}
          {check.kind === "ready" && (
            <span className="font-medium text-warn">Ready for your Hizb {check.hizb} check ◆</span>
          )}
          {check.kind === "done" && (
            <span className="font-medium text-ok">Target complete — masha&rsquo;Allah.</span>
          )}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (the component isn't imported yet — that's fine).

- [ ] **Step 3: Commit**

```bash
git add src/components/app/hifz-hero.tsx
git commit -m "feat(hifz): hero strip — current surah, juz ring, hizb bars, check line"
```

---

### Task 5: Journey path component

**Files:**
- Create: `src/components/app/hifz-journey.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/app/hifz-journey.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { fmtDay } from "@/lib/format";
import { hizbOf, rowPlan } from "@/lib/hifz/hizb";
import { SURAH_META } from "@/lib/hifz/surah-meta";
import type { Surah } from "@/lib/hifz/pace";

type Rec = { passed_at: string; teacher_comment: string | null };

/** Gentle winding: node indent cycles per row. CSS only, no animation. */
const OFFSETS = [0, 16, 32, 16];

/**
 * The path itself. Shows the student's own list, grouped by hizb, with a
 * "you are here" node, a dashed marker where class pace sits, collapsed
 * upcoming stretches, and hizb-check milestone cards between groups.
 * Comments live in <HifzRecord>; nodes only get a 💬 hint.
 */
export function HifzJourney({
  list,
  records,
  expected,
}: {
  list: Surah[];
  records: Map<number, Rec>;
  expected: number;
}) {
  const passedCount = list.filter((s) => records.has(s.number)).length;
  const currentIdx = list.findIndex((s) => !records.has(s.number)); // -1 → all passed
  const markerIdx =
    expected > 0 && expected !== passedCount ? Math.min(expected, list.length) - 1 : null;

  // Contiguous hizb groups over the list, keeping each surah's global index.
  const groups: { hizb: number | null; start: number; surahs: Surah[] }[] = [];
  list.forEach((s, i) => {
    const h = hizbOf(s.number);
    const last = groups[groups.length - 1];
    if (last && last.hizb === h) last.surahs.push(s);
    else groups.push({ hizb: h, start: i, surahs: [s] });
  });

  const groupState = (g: (typeof groups)[number]) => {
    const passed = g.surahs.filter((s) => records.has(s.number)).length;
    if (passed === g.surahs.length) return "complete";
    if (currentIdx >= g.start && currentIdx < g.start + g.surahs.length) return "current";
    return "future";
  };

  return (
    <section className="rounded-lg border border-line bg-card p-5">
      {groups.map((g, gi) => {
        const state = groupState(g);
        const next = groups[gi + 1];
        const nextStarted = next ? next.surahs.some((s) => records.has(s.number)) : false;
        const first = g.surahs[0];
        const last = g.surahs[g.surahs.length - 1];

        // Future groups collapse to a label row.
        if (state === "future") {
          return (
            <div key={gi} className="border-t border-line pt-3 mt-3 first:mt-0 first:border-t-0 first:pt-0">
              <p className="text-xs text-muted-foreground/60">
                Hizb {g.hizb} — {first.name_en} to {last.name_en} · {g.surahs.length} surahs
              </p>
            </div>
          );
        }

        // Which rows stay visible: everything except upcoming nodes, but keep
        // the first upcoming, the group's last node, and the pace-marker node.
        const keep = new Set<number>();
        g.surahs.forEach((s, li) => {
          const i = g.start + li;
          const upcoming = !records.has(s.number) && i !== currentIdx;
          if (!upcoming || i === currentIdx + 1 || li === g.surahs.length - 1 || i === markerIdx)
            keep.add(li);
        });

        return (
          <div key={gi} className={cn(gi > 0 && "mt-4")}>
            <p className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              Hizb {g.hizb} — {first.name_en} to {last.name_en}
            </p>

            {rowPlan(g.surahs.length, keep).map((row, ri) => {
              if (row.kind === "gap") {
                return (
                  <div key={`gap-${ri}`} className="my-1 ml-9 text-xs text-muted-foreground/60">
                    … {row.count} more surahs
                  </div>
                );
              }
              const li = row.index;
              const i = g.start + li;
              const s = g.surahs[li];
              const rec = records.get(s.number);
              const offset = OFFSETS[li % OFFSETS.length];
              const isCurrent = i === currentIdx;
              const nodeMeta = SURAH_META[s.number];

              return (
                <div key={s.number}>
                  {li > 0 && (
                    <div
                      className={cn("h-3 w-0.5", rec ? "bg-ok" : "bg-line")}
                      style={{ marginLeft: offset + 13 }}
                    />
                  )}
                  {isCurrent ? (
                    <div className="flex items-center gap-3" style={{ marginLeft: offset }}>
                      <div className="grid size-12 shrink-0 place-items-center rounded-full border-[3px] border-ok bg-card shadow-sm">
                        <span dir="rtl" lang="ar" className="ar-ui text-xs text-ok">
                          {s.name_ar}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{s.name_en} — you are here</p>
                        {nodeMeta && (
                          <p className="text-xs text-muted-foreground">
                            {nodeMeta.ayahs} ayahs · &ldquo;{nodeMeta.meaning}&rdquo;
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      className={cn("flex items-center gap-2.5", !rec && "opacity-50")}
                      style={{ marginLeft: offset }}
                    >
                      <span
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-full text-[11px]",
                          rec ? "bg-ok text-white" : "border border-line text-muted-foreground",
                        )}
                      >
                        {rec ? "✓" : ""}
                      </span>
                      <span className="min-w-0 truncate text-sm text-muted-foreground">
                        {s.name_en}{" "}
                        <span dir="rtl" lang="ar" className="ar-ui">
                          {s.name_ar}
                        </span>
                        {rec?.teacher_comment && <span className="ml-1 text-xs">💬</span>}
                      </span>
                      {rec && (
                        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                          {fmtDay(rec.passed_at)}
                        </span>
                      )}
                    </div>
                  )}
                  {i === markerIdx && (
                    <>
                      <div className="h-3 w-0.5 bg-line" style={{ marginLeft: offset + 13 }} />
                      <div className="flex items-center gap-2.5" style={{ marginLeft: offset }}>
                        <span className="size-7 shrink-0 rounded-full border-2 border-dashed border-warn" />
                        <span className="text-xs text-warn">class pace is here — {s.name_en}</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Hizb-check milestone after this group (not after the final group). */}
            {next && g.hizb !== null && (
              <div
                className={cn(
                  "mt-3 flex items-center gap-3 rounded-lg border px-4 py-3",
                  state === "complete" && !nextStarted && "border-warn bg-warn/10",
                  state === "complete" && nextStarted && "border-line bg-muted/50",
                  state === "current" && "border-dashed border-warn/50 bg-warn/5",
                )}
              >
                <span className={cn("text-base", state === "complete" && nextStarted ? "text-ok" : "text-warn")}>
                  {state === "complete" && nextStarted ? "✓" : "◆"}
                </span>
                <div>
                  <p className={cn("text-xs font-medium", state === "current" ? "text-warn" : "text-foreground")}>
                    {state === "complete" && !nextStarted
                      ? `Ready for your Hizb ${g.hizb} check`
                      : `Hizb ${g.hizb} check`}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Present the whole hizb to your teacher in one sitting
                    {next.hizb !== null && ` — then Hizb ${next.hizb} begins`}.
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Completion milestone at the end of the student's own list. */}
      {currentIdx === -1 && list.length > 0 && (
        <div className="mt-3 rounded-lg border border-ok bg-ok/10 px-4 py-3 text-center">
          <p className="text-sm font-medium text-ok">Target complete — masha&rsquo;Allah.</p>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/app/hifz-journey.tsx
git commit -m "feat(hifz): journey path — hizb groups, you-are-here, pace marker, milestones"
```

---

### Task 6: Record component

**Files:**
- Create: `src/components/app/hifz-record.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/app/hifz-record.tsx`:

```tsx
import { fmtDay } from "@/lib/format";

export type RecordEntry = {
  number: number;
  name_en: string;
  name_ar: string;
  passed_at: string;
  teacher_comment: string | null;
};

/**
 * "Your record" — the one place teacher comments appear in full. Entries
 * arrive most-recent-first; the two newest always show, the rest sit behind
 * a native <details> (no client JS). Renders nothing before the first pass.
 */
export function HifzRecord({ entries }: { entries: RecordEntry[] }) {
  if (entries.length === 0) return null;
  const preview = entries.slice(0, 2);
  const rest = entries.slice(2);
  return (
    <section className="rounded-lg border border-line bg-card p-5">
      <h2 className="text-sm font-medium">Your record</h2>
      <ul className="mt-3 space-y-3">
        {preview.map((e) => (
          <RecordRow key={e.number} e={e} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="group mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer list-none text-center text-xs font-medium text-ok [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show all {entries.length} ▾</span>
            <span className="hidden group-open:inline">Show fewer ▴</span>
          </summary>
          <ul className="mt-3 space-y-3">
            {rest.map((e) => (
              <RecordRow key={e.number} e={e} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function RecordRow({ e }: { e: RecordEntry }) {
  return (
    <li className="border-l-2 border-line pl-3">
      <p className="text-sm">
        <span className="font-medium">{e.name_en}</span>{" "}
        <span dir="rtl" lang="ar" className="ar-ui text-muted-foreground">
          {e.name_ar}
        </span>
        <span className="ml-2 text-xs tabular-nums text-muted-foreground">
          passed {fmtDay(e.passed_at)}
        </span>
      </p>
      {e.teacher_comment && (
        <p className="mt-1 rounded-md bg-muted px-2.5 py-1.5 text-xs text-ink-2">
          {e.teacher_comment}
        </p>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/app/hifz-record.tsx
git commit -m "feat(hifz): record section — recent passes + teacher comments"
```

---

### Task 7: Rewrite the page and verify end-to-end

**Files:**
- Modify: `src/app/(student)/hifz/page.tsx` (full rewrite below)

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `src/app/(student)/hifz/page.tsx` with:

```tsx
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks } from "@/lib/dashboard/queries";
import { expectedPassed, paceStatus, memorisationList, type Surah } from "@/lib/hifz/pace";
import { assumedPassed, checkStatus, hizbBlocks, juzProgress } from "@/lib/hifz/hizb";
import { SURAH_META } from "@/lib/hifz/surah-meta";
import { HifzHero } from "@/components/app/hifz-hero";
import { HifzJourney } from "@/components/app/hifz-journey";
import { HifzRecord, type RecordEntry } from "@/components/app/hifz-record";

export const dynamic = "force-dynamic";

export default async function StudentHifz() {
  const profile = (await currentProfile())!;
  const db = await supabaseServer();
  const { weeks } = await getTermsAndWeeks();

  const [{ data: hp }, { data: surahs }, { data: records }] = await Promise.all([
    db.from("hifz_profiles").select("start_surah, target_count").eq("student_id", profile.id).maybeSingle(),
    db.from("surahs").select("number, order_index, name_ar, name_en").order("order_index"),
    db.from("hifz_records").select("surah_number, passed_at, teacher_comment").eq("student_id", profile.id),
  ]);

  if (!hp) {
    return (
      <div className="rounded-lg border border-line bg-card p-8 text-center">
        <h1 className="text-xl">Hifz</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your teacher hasn&apos;t set your memorisation target yet.
        </p>
      </div>
    );
  }

  const all = (surahs ?? []) as Surah[];
  const list = memorisationList(hp.start_surah, hp.target_count, all);
  const recordMap = new Map(
    (records ?? []).map((r) => [
      r.surah_number,
      { passed_at: r.passed_at, teacher_comment: r.teacher_comment },
    ]),
  );
  const passedSet = new Set(recordMap.keys());

  // Derived numbers all use the assumed set so a returning student's earlier
  // years count; the path itself only ever shows this year's list.
  const assumed = assumedPassed(all, list, passedSet);
  const blocks = hizbBlocks(all, assumed);
  // passedSet, not assumed: last year's hizb check doesn't need redoing
  const check = checkStatus(blocks, passedSet);
  const juz = juzProgress(all, list, assumed);

  const passedCount = list.filter((s) => passedSet.has(s.number)).length;
  const expected = expectedPassed(new Date(), weeks, hp.target_count);
  const pace = expected > 0 ? paceStatus(passedCount, expected) : null;
  const current = list.find((s) => !passedSet.has(s.number)) ?? list[list.length - 1];
  const complete = passedCount === list.length && list.length > 0;

  const byNumber = new Map(all.map((s) => [s.number, s]));
  const entries: RecordEntry[] = (records ?? [])
    .map((r) => {
      const s = byNumber.get(r.surah_number);
      return s
        ? {
            number: s.number,
            name_en: s.name_en,
            name_ar: s.name_ar,
            passed_at: r.passed_at,
            teacher_comment: r.teacher_comment,
            order_index: s.order_index,
          }
        : null;
    })
    .filter((e): e is RecordEntry & { order_index: number } => e !== null)
    .sort((a, b) =>
      a.passed_at === b.passed_at
        ? b.order_index - a.order_index // same Thursday: further along = later
        : b.passed_at.localeCompare(a.passed_at),
    );

  return (
    <div className="max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl">Hifz</h1>
      </header>

      <HifzHero
        nameEn={current?.name_en ?? ""}
        nameAr={current?.name_ar ?? ""}
        meta={current ? SURAH_META[current.number] : undefined}
        juz={juz}
        blocks={blocks}
        pace={pace}
        complete={complete}
        check={check}
      />

      <HifzJourney list={list} records={recordMap} expected={expected} />

      <HifzRecord entries={entries} />
    </div>
  );
}
```

Note: the page no longer imports `PaceMarker` — do not delete
`src/components/app/pace-marker.tsx`; student home and the teacher hifz detail page
still use it.

- [ ] **Step 2: Typecheck and run the whole test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean; all suites pass (`pace.test.ts`, `hizb.test.ts`,
`surah-meta.test.ts`).

- [ ] **Step 3: Manual verification against seeded demo data**

Start the dev server (`npm run dev`) and log in as a demo student
(credentials/seed: see `supabase/migrations/0005_demo_full_year.sql`). On `/hifz`
check, against that student's actual seeded records:

1. Hero: Arabic name of the first unpassed surah; "Juz 'Amma · N of 37" matches their
   passed count; pace chip matches the old page's status; three hizb bars sized
   28/9/6 with the first partially filled; "N surahs until your Hizb 60 check" where
   N = 28 − passed-in-block.
2. Path: passed nodes filled with dates; large "you are here" node with ayah count +
   meaning; dashed amber "class pace is here" marker present when expected ≠ passed;
   long upcoming stretch collapsed to "… N more surahs"; gold "Hizb 60 check"
   milestone card after the 28th node; Hizb 59/58 rendered as collapsed label rows.
3. Record: two most recent passes visible with dates; "Show all N ▾" expands the
   full most-recent-first list; teacher comments render in quote blocks; 💬 hint on
   commented path nodes.
4. Mobile: at 390px wide nothing overflows horizontally; hero wraps (ring drops
   below the Arabic name); node text truncates rather than wraps ugly.
5. Empty state: a student with a hifz profile but zero records shows the 0-state
   ring, an all-ghosted path, no record card, and "28 surahs until your Hizb 60
   check". A student with no hifz profile still gets the unchanged "teacher hasn't
   set your target" card.
6. Dark mode: toggle the theme — ring, bars, and milestone cards stay legible (they
   use tokens, so this is a sanity check, not a fix pass).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(student)/hifz/page.tsx"
git commit -m "feat(hifz): student journey page — hero, hizb path, record"
```
