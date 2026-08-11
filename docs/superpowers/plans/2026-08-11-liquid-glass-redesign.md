# Liquid Glass Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the student Home and Progress screens in an adaptive "Ink Glass" design language, replacing bare numbers with animated data visualization, without touching any query, schema, or teacher screen.

**Architecture:** Pure geometry helpers live in `src/lib/viz/*.ts` (no DOM, unit-tested with vitest); presentation components live in `src/components/app/*.tsx` and consume those helpers; design tokens and the glass/glow/motion CSS live in `src/app/globals.css`. The two pages are re-assembled from the new components using the data they already fetch. Shared components used by teacher screens (`StatTile`, `PaceMarker`, `ui/card.tsx`) are deliberately left untouched — new components are added alongside them.

**Tech Stack:** Next.js 16.2.12 (App Router, RSC), React 19.2.4, Tailwind CSS v4 (CSS-first `@theme inline`), next-themes 0.4.6, vitest 4 + @testing-library/react (jsdom), hand-rolled SVG (no chart library).

**Reference spec:** `docs/superpowers/specs/2026-08-11-liquid-glass-redesign-design.md`

---

## Critical context for the implementing engineer

**Read this before writing code:**

1. **This is Next.js 16, not the Next.js in your training data.** `web/AGENTS.md` says: read the relevant guide in `web/node_modules/next/dist/docs/` before writing anything framework-shaped. For this plan the only framework-level change is `layout.tsx`'s ThemeProvider props, but heed deprecation notices if the build complains.
2. **All commands run from `web/`**, not the repo root: `cd "/Users/ibrahimramadan/BSMS Tajweed app/web"`.
3. **Test command:** `npm test` (vitest run, jsdom, `src/**/*.test.{ts,tsx}`). A single file: `npx vitest run src/lib/viz/ring.test.ts`.
4. **Branch:** all work happens on `feat/liquid-glass-redesign`, already created and checked out. **Never push to `main`** — a push to `main` deploys straight to students.
5. **Colour rule:** never hardcode a hex value in a component. Use the existing semantic Tailwind tokens (`bg-ok`, `text-danger`, `stroke-warn`, `bg-chart-1`…) or the new glass CSS variables. All of them already have light and dark values.
6. **Server vs client components:** pages are React Server Components. A component only needs `"use client"` if it uses hooks. `Sparkline`, `SegmentedCapsule`, `TermBars`, `HifzArc` are pure render — no directive. `ProgressRing` and `useCountUp` use hooks — they need it.

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/app/globals.css` | Glass/glow/motion tokens, `.glass` utility, keyframes, reduced-motion guard | Modify |
| `src/app/layout.tsx` | ThemeProvider → system-aware | Modify |
| `src/app/(student)/layout.tsx` | Renders the ambient glow layer behind the student shell | Modify |
| `src/components/app/shell.tsx` | Opt-in `glass` variant for the student chrome | Modify |
| `src/lib/viz/ring.ts` + test | Ring geometry (pure) | Create |
| `src/lib/viz/sparkline.ts` + test | Sparkline points + trend (pure) | Create |
| `src/lib/viz/term-bars.ts` + test | Term bar composition 80/20 (pure) | Create |
| `src/lib/viz/journey.ts` + test | Hifz path node coordinates (pure) | Create |
| `src/components/app/use-count-up.ts` + test | Count-up hook + reduced-motion probe | Create |
| `src/components/app/count-up.tsx` | Client wrapper so server pages can use the hook | Create |
| `src/components/app/progress-ring.tsx` + test | Animated ring | Create |
| `src/components/app/sparkline.tsx` | Trend line | Create |
| `src/components/app/segmented-capsule.tsx` + test | One segment per released homework | Create |
| `src/components/app/term-bars.tsx` | Stacked term bars | Create |
| `src/components/app/hifz-arc.tsx` | Hifz journey path for Home | Create |
| `src/components/app/leaderboard-panel.tsx` | Ranked bars behind existing rows | Modify |
| `src/components/app/marked-homework.tsx` | Row list on glass (one class, line 52) | Modify |
| `src/app/(student)/home/page.tsx` | Assemble Home | Modify |
| `src/app/(student)/progress/page.tsx` | Assemble Progress | Modify |

**Left alone on purpose:** `stat-tile.tsx` and `pace-marker.tsx` (used by `teacher/home`, `teacher/curriculum`, `teacher/hifz/[studentId]`), `ui/card.tsx`, `strike-dots.tsx` internals, every teacher route.

---

### Task 1: Design tokens, glass utility, and adaptive theme

**Files:**
- Modify: `src/app/globals.css` (append after the existing `.ar-quran` block; edit the `.dark` block)
- Modify: `src/app/layout.tsx:50`

- [ ] **Step 1: Deepen the dark ground so glass has something to sit on**

In `src/app/globals.css`, inside the `.dark { … }` block, change the background line:

```css
  --background: #0f1322;
```

(It is currently `#151a28`. Nothing else in that block changes.)

- [ ] **Step 2: Append the glass, glow, and motion layer to `globals.css`**

Add this at the very end of the file, after the `.ar-quran` rule:

```css
/* ─────────────────────────────────────────────────────────────────────
   Liquid glass — panels, ambient glows, entrance motion.
   Every value is a token so light and dark stay one design, lit twice.
   ──────────────────────────────────────────────────────────────────── */
:root {
  --glass-bg: rgba(255, 255, 255, 0.55);
  --glass-border: rgba(255, 255, 255, 0.72);
  --glass-shadow: 0 8px 24px rgba(29, 35, 57, 0.08);
  --glass-blur: 20px;
  --glow-1: #3b5bdb;
  --glow-2: #2e5e4e;
  --glow-3: #8a6a2f;
  --glow-opacity: 0.13;
}

.dark {
  --glass-bg: rgba(29, 35, 57, 0.45);
  --glass-border: rgba(232, 236, 242, 0.13);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  --glass-blur: 20px;
  --glow-1: #3b5bdb;
  --glow-2: #5fa98c;
  --glow-3: #c9a45c;
  --glow-opacity: 0.30;
}

.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
}

/* Safari/Firefox without backdrop-filter would render unreadable washes —
   fall back to the solid card colour rather than transparency. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass {
    background: var(--card);
  }
}

.glass-hover {
  transition:
    transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94),
    border-color 0.25s ease,
    box-shadow 0.25s ease;
}
.glass-hover:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--glass-border) 100%, var(--foreground) 12%);
}

/* Ambient glows — the only thing the glass has to refract. Fixed, behind
   everything, transform-only so they never trigger layout. */
.glow-layer {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}
.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: var(--glow-opacity);
  will-change: transform;
}
.glow-a {
  background: var(--glow-1);
  width: 46vw;
  height: 46vw;
  top: -10vw;
  right: -8vw;
  animation: drift-a 38s ease-in-out infinite;
}
.glow-b {
  background: var(--glow-2);
  width: 40vw;
  height: 40vw;
  bottom: -12vw;
  left: -6vw;
  animation: drift-b 45s ease-in-out infinite;
}
.glow-c {
  background: var(--glow-3);
  width: 28vw;
  height: 28vw;
  top: 42%;
  left: 48%;
  animation: drift-c 33s ease-in-out infinite;
}

@keyframes drift-a {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(-5vw, 4vw, 0) scale(1.1); }
}
@keyframes drift-b {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(6vw, -3vw, 0) scale(1.08); }
}
@keyframes drift-c {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(-4vw, -5vw, 0) scale(0.92); }
}

/* Entrance — panels rise once on load. Stagger with an inline animation-delay. */
@keyframes rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
.anim-in {
  animation: rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes grow {
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
}
.anim-grow {
  transform-origin: bottom;
  animation: grow 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* Luminous data strokes, dark mode only — in daylight a glow just muddies. */
.dark .data-glow {
  filter: drop-shadow(0 0 5px currentColor);
}

@media (prefers-reduced-motion: reduce) {
  .glow,
  .anim-in,
  .anim-grow {
    animation: none !important;
  }
  .anim-in { opacity: 1; transform: none; }
  .anim-grow { transform: none; }
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Make the theme follow the browser**

In `src/app/layout.tsx`, replace line 50:

```tsx
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
```

The manual sun/moon toggle in `shell.tsx` keeps working unchanged — next-themes persists an explicit choice in localStorage and only falls back to the system preference when the reader has never chosen.

- [ ] **Step 4: Verify the app still builds and every existing test passes**

Run: `cd "/Users/ibrahimramadan/BSMS Tajweed app/web" && npm test && npm run build`
Expected: all tests pass, build completes with no CSS or type errors. (No component consumes the new classes yet — this step only proves nothing broke.)

- [ ] **Step 5: Commit**

```bash
cd "/Users/ibrahimramadan/BSMS Tajweed app"
git add web/src/app/globals.css web/src/app/layout.tsx
git commit -m "feat(ui): glass tokens, ambient glow layer, system-aware theme

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Ring geometry helper

**Files:**
- Create: `src/lib/viz/ring.ts`
- Test: `src/lib/viz/ring.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/viz/ring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ringGeometry } from "./ring";

const R = 30;
const C = 2 * Math.PI * R;

describe("ringGeometry", () => {
  it("leaves the arc undrawn when there is no value", () => {
    const g = ringGeometry(null, R);
    expect(g.pct).toBeNull();
    expect(g.offset).toBeCloseTo(C);
  });

  it("draws nothing at 0 and the full circle at 100", () => {
    expect(ringGeometry(0, R).offset).toBeCloseTo(C);
    expect(ringGeometry(100, R).offset).toBeCloseTo(0);
  });

  it("draws half the circle at 50", () => {
    expect(ringGeometry(50, R).offset).toBeCloseTo(C / 2);
  });

  it("clamps out-of-range marks instead of overdrawing", () => {
    // A 105% mark exists in real data (bonus marks) and must not wrap the ring.
    expect(ringGeometry(140, R).offset).toBeCloseTo(0);
    expect(ringGeometry(140, R).pct).toBe(100);
    expect(ringGeometry(-5, R).offset).toBeCloseTo(C);
    expect(ringGeometry(-5, R).pct).toBe(0);
  });

  it("survives NaN rather than emitting NaN into the DOM", () => {
    const g = ringGeometry(Number.NaN, R);
    expect(g.pct).toBeNull();
    expect(Number.isNaN(g.offset)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "/Users/ibrahimramadan/BSMS Tajweed app/web" && npx vitest run src/lib/viz/ring.test.ts`
Expected: FAIL — "Failed to resolve import ./ring".

- [ ] **Step 3: Write the implementation**

Create `src/lib/viz/ring.ts`:

```ts
/**
 * Ring geometry — pure, no DOM.
 *
 * An SVG arc is drawn by dashing the circle to its own circumference and then
 * offsetting that dash: offset === circumference means nothing drawn, 0 means
 * the whole ring. Keeping the arithmetic here means the component stays a
 * render function and the clamping rules are testable on their own.
 */
export type RingGeometry = {
  circumference: number;
  /** stroke-dashoffset for the value. */
  offset: number;
  /** The clamped percentage, or null when there is nothing to draw. */
  pct: number | null;
};

export function ringGeometry(value: number | null | undefined, radius: number): RingGeometry {
  const circumference = 2 * Math.PI * radius;
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { circumference, offset: circumference, pct: null };
  }
  const pct = Math.max(0, Math.min(100, value));
  return { circumference, offset: circumference * (1 - pct / 100), pct };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/viz/ring.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/ibrahimramadan/BSMS Tajweed app"
git add web/src/lib/viz/ring.ts web/src/lib/viz/ring.test.ts
git commit -m "feat(viz): ring geometry helper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Sparkline geometry helper

**Files:**
- Create: `src/lib/viz/sparkline.ts`
- Test: `src/lib/viz/sparkline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/viz/sparkline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sparklinePoints, trendOf } from "./sparkline";

const ys = (points: string) => points.split(" ").map((p) => Number(p.split(",")[1]));
const xs = (points: string) => points.split(" ").map((p) => Number(p.split(",")[0]));

describe("sparklinePoints", () => {
  it("refuses to draw a line through fewer than two marks", () => {
    expect(sparklinePoints([], 100, 20)).toBe("");
    expect(sparklinePoints([72], 100, 20)).toBe("");
  });

  it("emits one point per mark, spread across the full width", () => {
    const p = sparklinePoints([60, 70, 80], 100, 20);
    expect(p.split(" ")).toHaveLength(3);
    expect(xs(p)[0]).toBe(0);
    expect(xs(p)[2]).toBe(100);
  });

  it("puts a flat run on the midline instead of dividing by zero", () => {
    const p = sparklinePoints([75, 75, 75], 100, 20);
    expect(ys(p)).toEqual([10, 10, 10]);
    expect(p).not.toContain("NaN");
  });

  it("draws improvement as a rising line (smaller y is higher in SVG)", () => {
    const p = sparklinePoints([50, 90], 100, 20);
    expect(ys(p)[1]).toBeLessThan(ys(p)[0]);
  });

  it("keeps every point inside the box", () => {
    const p = sparklinePoints([10, 99, 40, 88], 120, 30);
    for (const y of ys(p)) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(30);
    }
  });
});

describe("trendOf", () => {
  it("calls a rise up and a fall down", () => {
    expect(trendOf([60, 80])).toBe("up");
    expect(trendOf([80, 60])).toBe("down");
  });

  it("calls a negligible change flat, so noise is not reported as progress", () => {
    expect(trendOf([75, 75.2])).toBe("flat");
    expect(trendOf([75])).toBe("flat");
    expect(trendOf([])).toBe("flat");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/viz/sparkline.test.ts`
Expected: FAIL — "Failed to resolve import ./sparkline".

- [ ] **Step 3: Write the implementation**

Create `src/lib/viz/sparkline.ts`:

```ts
/**
 * Sparkline geometry — pure, no DOM.
 *
 * Scaled to the run's own min/max rather than 0–100: across six marks that
 * all sit in the seventies, an absolute scale draws a flat line and says
 * nothing. The point of the line is the shape of the change.
 */
const round = (n: number) => Math.round(n * 100) / 100;

export function sparklinePoints(
  values: number[],
  width: number,
  height: number,
  pad = 2,
): string {
  if (values.length < 2) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerH = Math.max(0, height - pad * 2);
  const step = width / (values.length - 1);

  return values
    .map((v, i) => {
      const x = round(i * step);
      // A flat run has no span to scale against — sit it on the midline.
      const y = span === 0 ? round(height / 2) : round(pad + innerH * (1 - (v - min) / span));
      return `${x},${y}`;
    })
    .join(" ");
}

export type Trend = "up" | "down" | "flat";

/** First mark to last. Sub-point moves are noise, not a trend. */
export function trendOf(values: number[]): Trend {
  if (values.length < 2) return "flat";
  const delta = values[values.length - 1] - values[0];
  if (Math.abs(delta) < 0.5) return "flat";
  return delta > 0 ? "up" : "down";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/viz/sparkline.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/ibrahimramadan/BSMS Tajweed app"
git add web/src/lib/viz/sparkline.ts web/src/lib/viz/sparkline.test.ts
git commit -m "feat(viz): sparkline geometry helper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Term bar composition helper

**Files:**
- Create: `src/lib/viz/term-bars.ts`
- Test: `src/lib/viz/term-bars.test.ts`

Background the engineer needs: a term mark is **80% exam + 20% homework average**. `TermProgress` (defined in `src/lib/dashboard/queries.ts:66`) is `{ termId, examMax, hwAvg, termPct, examScore }`, where `hwAvg` is a percentage 0–100, `examScore` is a raw mark out of `examMax`, and `termPct` is the database's own computed figure — null until the exam is sat.

- [ ] **Step 1: Write the failing test**

Create `src/lib/viz/term-bars.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { termBar } from "./term-bars";
import type { TermProgress } from "@/lib/dashboard/queries";

const term = (over: Partial<TermProgress> = {}): TermProgress => ({
  termId: 1,
  examMax: 50,
  hwAvg: null,
  termPct: null,
  examScore: null,
  ...over,
});

describe("termBar", () => {
  it("splits a complete term into its 80/20 contributions", () => {
    const bar = termBar(term({ examMax: 50, examScore: 40, hwAvg: 90, termPct: 82 }));
    expect(bar.examPart).toBeCloseTo(64); // 40/50 × 80
    expect(bar.hwPart).toBeCloseTo(18); //  90%  × 20
    expect(bar.termPct).toBe(82);
  });

  it("shows homework alone while the exam is unsat, with no term mark invented", () => {
    const bar = termBar(term({ hwAvg: 75, examScore: null, termPct: null }));
    expect(bar.examPart).toBeNull();
    expect(bar.hwPart).toBeCloseTo(15);
    expect(bar.termPct).toBeNull();
  });

  it("shows an empty bar for a term that has not started", () => {
    const bar = termBar(term());
    expect(bar.examPart).toBeNull();
    expect(bar.hwPart).toBeNull();
    expect(bar.total).toBe(0);
  });

  it("totals the parts that exist", () => {
    expect(termBar(term({ examMax: 50, examScore: 50, hwAvg: 100 })).total).toBeCloseTo(100);
    expect(termBar(term({ hwAvg: 50 })).total).toBeCloseTo(10);
  });

  it("refuses to divide by a zero exam total", () => {
    const bar = termBar(term({ examMax: 0, examScore: 0, hwAvg: 60 }));
    expect(bar.examPart).toBeNull();
    expect(Number.isFinite(bar.total)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/viz/term-bars.test.ts`
Expected: FAIL — "Failed to resolve import ./term-bars".

- [ ] **Step 3: Write the implementation**

Create `src/lib/viz/term-bars.ts`:

```ts
import type { TermProgress } from "@/lib/dashboard/queries";

/**
 * Term bar composition — pure, no DOM.
 *
 * A term mark is 80% exam + 20% homework. The bar shows those two
 * contributions stacked, so "why is my term mark that" is answerable by
 * looking rather than by being told the formula.
 */
export const EXAM_WEIGHT = 80;
export const HW_WEIGHT = 20;

export type TermBar = {
  termId: number;
  /** 0–80, the exam's contribution. Null until the exam is sat. */
  examPart: number | null;
  /** 0–20, homework's contribution. Null while nothing is marked. */
  hwPart: number | null;
  /** examPart + hwPart, counting only the parts that exist. */
  total: number;
  /** The database's own term %, echoed for the label. Null while incomplete. */
  termPct: number | null;
};

export function termBar(t: TermProgress): TermBar {
  const examPart =
    t.examScore === null || !t.examMax ? null : (t.examScore / t.examMax) * EXAM_WEIGHT;
  const hwPart = t.hwAvg === null ? null : (t.hwAvg / 100) * HW_WEIGHT;
  return {
    termId: t.termId,
    examPart,
    hwPart,
    total: (examPart ?? 0) + (hwPart ?? 0),
    termPct: t.termPct,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/viz/term-bars.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/ibrahimramadan/BSMS Tajweed app"
git add web/src/lib/viz/term-bars.ts web/src/lib/viz/term-bars.test.ts
git commit -m "feat(viz): term bar 80/20 composition helper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Hifz journey path helper

**Files:**
- Create: `src/lib/viz/journey.ts`
- Test: `src/lib/viz/journey.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/viz/journey.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { journeyNodes } from "./journey";

describe("journeyNodes", () => {
  it("returns nothing to draw for an empty target", () => {
    expect(journeyNodes(0, 300, 60)).toEqual([]);
    expect(journeyNodes(-3, 300, 60)).toEqual([]);
  });

  it("returns one node per surah", () => {
    // 43 is the real target: An-Nas down to Al-Jinn.
    expect(journeyNodes(43, 300, 60)).toHaveLength(43);
  });

  it("walks left to right, never backwards", () => {
    const nodes = journeyNodes(12, 300, 60);
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i].x).toBeGreaterThan(nodes[i - 1].x);
    }
  });

  it("keeps every node inside the drawing box", () => {
    for (const n of journeyNodes(20, 300, 60)) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(300);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(60);
    }
  });

  it("places a lone node at the start rather than dividing by zero", () => {
    const [only] = journeyNodes(1, 300, 60);
    expect(Number.isNaN(only.x)).toBe(false);
    expect(Number.isNaN(only.y)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/viz/journey.test.ts`
Expected: FAIL — "Failed to resolve import ./journey".

- [ ] **Step 3: Write the implementation**

Create `src/lib/viz/journey.ts`:

```ts
/**
 * Hifz journey geometry — pure, no DOM.
 *
 * Surahs are laid out along a gentle wave rather than a straight bar: the
 * memorisation list is a road a student walks down over a year, and a curve
 * reads as distance travelled in a way a progress bar does not.
 */
export type JourneyNode = { x: number; y: number };

const round = (n: number) => Math.round(n * 100) / 100;

export function journeyNodes(count: number, width: number, height: number): JourneyNode[] {
  if (count <= 0) return [];

  const pad = 6;
  const innerW = Math.max(0, width - pad * 2);
  const mid = height / 2;
  // Leave the padding clear at the extremes of the wave so nodes never clip.
  const amp = Math.max(0, height / 2 - pad);

  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1);
    return {
      x: round(pad + innerW * t),
      y: round(mid - Math.sin(t * Math.PI * 1.5) * amp * 0.7),
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/viz/journey.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/ibrahimramadan/BSMS Tajweed app"
git add web/src/lib/viz/journey.ts web/src/lib/viz/journey.test.ts
git commit -m "feat(viz): hifz journey path geometry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Count-up hook, reduced-motion probe, and CountUp component

**Files:**
- Create: `src/components/app/use-count-up.ts`
- Create: `src/components/app/count-up.tsx`
- Test: `src/components/app/use-count-up.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/app/use-count-up.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useCountUp } from "./use-count-up";

/** jsdom's matchMedia always reports false — stub it to claim the opposite. */
function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

function Probe({ target }: { target: number | null }) {
  const value = useCountUp(target, 40);
  return <span data-testid="v">{value === null ? "—" : value.toFixed(0)}</span>;
}

afterEach(() => vi.unstubAllGlobals());

describe("useCountUp", () => {
  it("lands on the target", async () => {
    stubReducedMotion(false);
    const { getByTestId } = render(<Probe target={84} />);
    await waitFor(() => expect(getByTestId("v").textContent).toBe("84"));
  });

  it("skips straight to the target when motion is unwelcome", async () => {
    stubReducedMotion(true);
    const { getByTestId } = render(<Probe target={84} />);
    await waitFor(() => expect(getByTestId("v").textContent).toBe("84"));
  });

  it("passes a missing value through instead of counting up to zero", () => {
    stubReducedMotion(false);
    const { getByTestId } = render(<Probe target={null} />);
    expect(getByTestId("v").textContent).toBe("—");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/app/use-count-up.test.tsx`
Expected: FAIL — "Failed to resolve import ./use-count-up".

- [ ] **Step 3: Write the implementation**

Create `src/components/app/use-count-up.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

/** Does the reader want motion kept to a minimum? Safe on the server. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Counts from zero to `target` once, on mount.
 *
 * Returns the target immediately when the reader asked for reduced motion, or
 * when there is no animation frame to hang off (server render, tests). A null
 * target passes straight through — a missing mark must never animate up to a
 * zero that looks like a real score.
 */
export function useCountUp(target: number | null, duration = 900): number | null {
  const [value, setValue] = useState<number | null>(target === null ? null : 0);

  useEffect(() => {
    if (target === null) {
      setValue(null);
      return;
    }
    if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      setValue(target);
      return;
    }

    let frame = 0;
    let started: number | null = null;
    const step = (now: number) => {
      if (started === null) started = now;
      const t = duration <= 0 ? 1 : Math.min(1, (now - started) / duration);
      // easeOutCubic — quick off the mark, settling gently on the final digits.
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/app/use-count-up.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Wrap the hook in a component the server pages can use**

The pages are Server Components and cannot call hooks, so the headline figures
get a thin client wrapper. Create `src/components/app/count-up.tsx`:

```tsx
"use client";

import { useCountUp } from "./use-count-up";

/**
 * A headline number that counts up once on arrival.
 *
 * Renders `fallback` when there is nothing to show, so a missing mark never
 * animates up to a zero that reads like a real score.
 */
export function CountUp({
  value,
  decimals = 0,
  suffix = "",
  fallback = "—",
}: {
  value: number | null;
  decimals?: number;
  suffix?: string;
  fallback?: string;
}) {
  const shown = useCountUp(value);
  if (shown === null) return <span className="text-muted-foreground/50">{fallback}</span>;
  return (
    <span className="tabular-nums">
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}
```

- [ ] **Step 6: Verify it compiles**

Run: `cd "/Users/ibrahimramadan/BSMS Tajweed app/web" && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd "/Users/ibrahimramadan/BSMS Tajweed app"
git add web/src/components/app/use-count-up.ts web/src/components/app/count-up.tsx web/src/components/app/use-count-up.test.tsx
git commit -m "feat(ui): count-up hook and component honouring reduced motion

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: ProgressRing component

**Files:**
- Create: `src/components/app/progress-ring.tsx`
- Test: `src/components/app/progress-ring.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/app/progress-ring.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ProgressRing } from "./progress-ring";

describe("ProgressRing", () => {
  it("draws a track and an arc when there is a value", () => {
    const { container } = render(<ProgressRing value={75} />);
    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });

  it("draws only the empty track when there is nothing marked", () => {
    const { container } = render(<ProgressRing value={null} />);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("tells a screen reader the figure, not the geometry", () => {
    const { container } = render(<ProgressRing value={75.4} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-label")).toBe("75% complete");
  });

  it("says plainly when there is no figure yet", () => {
    const { container } = render(<ProgressRing value={null} />);
    expect(container.querySelector("svg")!.getAttribute("aria-label")).toBe("No marks yet");
  });

  it("renders its centre content", () => {
    const { container } = render(<ProgressRing value={60}><b>60%</b></ProgressRing>);
    expect(container.textContent).toContain("60%");
  });

  it("never emits NaN into the DOM for an odd value", () => {
    const { container } = render(<ProgressRing value={Number.NaN} />);
    expect(container.innerHTML).not.toContain("NaN");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/app/progress-ring.test.tsx`
Expected: FAIL — "Failed to resolve import ./progress-ring".

- [ ] **Step 3: Write the implementation**

Create `src/components/app/progress-ring.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ringGeometry } from "@/lib/viz/ring";
import { prefersReducedMotion } from "./use-count-up";

export type RingTone = "ok" | "warn" | "danger" | "ink";

/** Both stroke and text colour: `currentColor` is what the dark-mode glow
 *  in globals.css draws its halo from. */
const TONES: Record<RingTone, string> = {
  ok: "stroke-ok text-ok",
  warn: "stroke-warn text-warn",
  danger: "stroke-danger text-danger",
  ink: "stroke-ink text-ink",
};

/**
 * A percentage as an arc, with whatever the caller wants in the middle.
 *
 * The arc animates from empty on mount by transitioning stroke-dashoffset,
 * which the compositor can handle on its own — no layout, no JS per frame.
 */
export function ProgressRing({
  value,
  size = 76,
  stroke = 7,
  tone = "ok",
  className,
  children,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  tone?: RingTone;
  className?: string;
  children?: React.ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const { circumference, offset, pct } = ringGeometry(value, radius);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDrawn(true);
      return;
    }
    // One frame of empty ring first, so the transition has somewhere to start.
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={pct === null ? "No marks yet" : `${pct.toFixed(0)}% complete`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-foreground/10"
        />
        {pct !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={drawn ? offset : circumference}
            className={cn(
              TONES[tone],
              "data-glow transition-[stroke-dashoffset] duration-1000 ease-out",
            )}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/app/progress-ring.test.tsx`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/ibrahimramadan/BSMS Tajweed app"
git add web/src/components/app/progress-ring.tsx web/src/components/app/progress-ring.test.tsx
git commit -m "feat(ui): animated progress ring

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Sparkline and SegmentedCapsule components

**Files:**
- Create: `src/components/app/sparkline.tsx`
- Create: `src/components/app/segmented-capsule.tsx`
- Test: `src/components/app/segmented-capsule.test.tsx`

- [ ] **Step 1: Write the failing test for the capsule**

Create `src/components/app/segmented-capsule.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SegmentedCapsule } from "./segmented-capsule";

describe("SegmentedCapsule", () => {
  it("draws one segment per released homework", () => {
    const { container } = render(
      <SegmentedCapsule segments={["done", "done", "overdue", "pending"]} />,
    );
    expect(container.querySelectorAll("span[data-state]")).toHaveLength(4);
  });

  it("colours each segment by its state", () => {
    const { container } = render(<SegmentedCapsule segments={["done", "overdue", "pending"]} />);
    const states = [...container.querySelectorAll("span[data-state]")].map((s) =>
      s.getAttribute("data-state"),
    );
    expect(states).toEqual(["done", "overdue", "pending"]);
  });

  it("counts only what is handed in, for screen readers", () => {
    const { container } = render(
      <SegmentedCapsule segments={["done", "done", "overdue", "pending"]} />,
    );
    expect(container.querySelector('[role="img"]')!.getAttribute("aria-label")).toBe(
      "2 of 4 homeworks handed in",
    );
  });

  it("says nothing is out yet in week zero rather than drawing an empty bar", () => {
    const { container } = render(<SegmentedCapsule segments={[]} />);
    expect(container.textContent).toContain("Nothing released yet");
    expect(container.querySelectorAll("span[data-state]")).toHaveLength(0);
  });

  it("survives a single released homework", () => {
    const { container } = render(<SegmentedCapsule segments={["pending"]} />);
    expect(container.querySelectorAll("span[data-state]")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/app/segmented-capsule.test.tsx`
Expected: FAIL — "Failed to resolve import ./segmented-capsule".

- [ ] **Step 3: Write both components**

Create `src/components/app/segmented-capsule.tsx`:

```tsx
import { cn } from "@/lib/utils";

/** done = handed in · overdue = past its deadline, still not in · pending = still has time */
export type Segment = "done" | "overdue" | "pending";

const FILL: Record<Segment, string> = {
  done: "bg-ok",
  overdue: "bg-danger",
  pending: "bg-foreground/12",
};

/**
 * One segment per homework released so far.
 *
 * "7 of 9" says how many; this says *which* — three in a row missed reads
 * differently from three missed across a term, and the count cannot show that.
 */
export function SegmentedCapsule({
  segments,
  className,
}: {
  segments: Segment[];
  className?: string;
}) {
  if (segments.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing released yet.</p>;
  }
  const done = segments.filter((s) => s === "done").length;

  return (
    <div
      className={cn("flex items-center gap-0.75", className)}
      role="img"
      aria-label={`${done} of ${segments.length} homeworks handed in`}
    >
      {segments.map((s, i) => (
        <span
          key={i}
          data-state={s}
          className={cn("h-3.5 min-w-0 flex-1 rounded-[3px]", FILL[s])}
        />
      ))}
    </div>
  );
}
```

Create `src/components/app/sparkline.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { sparklinePoints, trendOf } from "@/lib/viz/sparkline";

const TREND_TONE = {
  up: "text-ok",
  down: "text-danger",
  flat: "text-muted-foreground",
} as const;

/**
 * The shape of the last few marks. Renders nothing below two marks — a line
 * through one point is a decoration, not information.
 */
export function Sparkline({
  values,
  width = 112,
  height = 26,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;

  const points = sparklinePoints(values, width, height);
  const trend = trendOf(values);
  const [lastX, lastY] = points.split(" ").at(-1)!.split(",").map(Number);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn(TREND_TONE[trend], className)}
      role="img"
      aria-label={`Last ${values.length} marks, trending ${trend}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="data-glow"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill="currentColor" />
    </svg>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/app/segmented-capsule.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/ibrahimramadan/BSMS Tajweed app"
git add web/src/components/app/sparkline.tsx web/src/components/app/segmented-capsule.tsx web/src/components/app/segmented-capsule.test.tsx
git commit -m "feat(ui): sparkline and segmented capsule

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: TermBars component

**Files:**
- Create: `src/components/app/term-bars.tsx`
- Test: `src/components/app/term-bars.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/app/term-bars.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TermBars } from "./term-bars";
import type { TermProgress } from "@/lib/dashboard/queries";

const terms: TermProgress[] = [
  { termId: 1, examMax: 50, examScore: 40, hwAvg: 90, termPct: 82 },
  { termId: 2, examMax: 50, examScore: 35, hwAvg: 80, termPct: 72 },
  { termId: 3, examMax: 50, examScore: null, hwAvg: 75, termPct: null },
];

describe("TermBars", () => {
  it("draws a bar per term", () => {
    const { container } = render(<TermBars terms={terms} currentTermId={3} />);
    expect(container.querySelectorAll("[data-term]")).toHaveLength(3);
  });

  it("labels a finished term with its mark", () => {
    const { container } = render(<TermBars terms={terms} currentTermId={3} />);
    expect(container.textContent).toContain("82.0%");
  });

  it("marks the current term as live instead of inventing a mark for it", () => {
    const { container } = render(<TermBars terms={terms} currentTermId={3} />);
    const live = container.querySelector('[data-term="3"]')!;
    expect(live.textContent).toContain("live");
    expect(live.textContent).not.toContain("%");
  });

  it("shows both contributions once the exam is sat, homework alone before", () => {
    const { container } = render(<TermBars terms={terms} currentTermId={3} />);
    expect(container.querySelectorAll('[data-term="1"] [data-part="exam"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-term="3"] [data-part="exam"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-term="3"] [data-part="homework"]')).toHaveLength(1);
  });

  it("draws an empty track for a term that has not started", () => {
    const empty: TermProgress[] = [
      { termId: 1, examMax: 50, examScore: null, hwAvg: null, termPct: null },
    ];
    const { container } = render(<TermBars terms={empty} currentTermId={1} />);
    expect(container.querySelectorAll("[data-part]")).toHaveLength(0);
    expect(container.querySelector("[data-term]")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/app/term-bars.test.tsx`
Expected: FAIL — "Failed to resolve import ./term-bars".

- [ ] **Step 3: Write the implementation**

Create `src/components/app/term-bars.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { termBar } from "@/lib/viz/term-bars";
import type { TermProgress } from "@/lib/dashboard/queries";

/**
 * The year as three stacked bars — exam contribution beneath homework
 * contribution, summing to the term mark.
 *
 * The current term is outlined rather than filled with a projected figure:
 * a term mark before its exam is not a small mark, it is not a mark yet.
 */
export function TermBars({
  terms,
  currentTermId,
}: {
  terms: TermProgress[];
  currentTermId: number;
}) {
  return (
    <div className="flex items-end justify-around gap-4 sm:gap-8">
      {terms.map((t, i) => {
        const bar = termBar(t);
        const live = t.termId === currentTermId;
        const share = (part: number | null) =>
          bar.total > 0 && part !== null ? `${(part / bar.total) * 100}%` : "0%";

        return (
          <div
            key={t.termId}
            data-term={t.termId}
            className="flex min-w-0 flex-1 flex-col items-center gap-2"
          >
            <div className="flex h-36 w-full max-w-14 items-end">
              <div
                className={cn(
                  "relative w-full overflow-hidden rounded-lg",
                  live && "outline-1 outline-offset-2 outline-foreground/25",
                  bar.total === 0 && "bg-foreground/6",
                )}
                style={{ height: `${Math.max(bar.total, 4)}%` }}
              >
                <div className="anim-grow flex h-full w-full flex-col-reverse" style={{ animationDelay: `${i * 90}ms` }}>
                  {bar.examPart !== null && (
                    <span
                      data-part="exam"
                      className="w-full bg-chart-1"
                      style={{ height: share(bar.examPart) }}
                    />
                  )}
                  {bar.hwPart !== null && (
                    <span
                      data-part="homework"
                      className="w-full bg-chart-3"
                      style={{ height: share(bar.hwPart) }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="text-center">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Term {t.termId}
              </div>
              <div className="font-heading text-sm tabular-nums">
                {bar.termPct === null ? (
                  <span className="text-muted-foreground">{live ? "live" : "—"}</span>
                ) : (
                  `${bar.termPct.toFixed(1)}%`
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/app/term-bars.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/ibrahimramadan/BSMS Tajweed app"
git add web/src/components/app/term-bars.tsx web/src/components/app/term-bars.test.tsx
git commit -m "feat(ui): stacked term bars showing the 80/20 split

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: HifzArc component

**Files:**
- Create: `src/components/app/hifz-arc.tsx`
- Test: `src/components/app/hifz-arc.test.tsx`

**Naming note:** `hifz-journey.tsx` already exists and belongs to the full `/hifz` page (it renders surah names, hizb groups and teacher comments). Do **not** touch or rename it. This is the compact Home version, hence `HifzArc`.

- [ ] **Step 1: Write the failing test**

Create `src/components/app/hifz-arc.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HifzArc } from "./hifz-arc";

describe("HifzArc", () => {
  it("draws a node per surah in the target", () => {
    const { container } = render(<HifzArc passed={5} expected={4} target={12} />);
    expect(container.querySelectorAll("[data-node]")).toHaveLength(12);
  });

  it("marks exactly the passed surahs as done", () => {
    const { container } = render(<HifzArc passed={5} expected={4} target={12} />);
    expect(container.querySelectorAll('[data-node="done"]')).toHaveLength(5);
  });

  it("says the student is ahead when they are past the expectation", () => {
    const { container } = render(<HifzArc passed={6} expected={4} target={12} />);
    expect(container.textContent).toContain("ahead of pace");
    expect(container.textContent).toContain("6");
    expect(container.textContent).toContain("12");
  });

  it("says on pace and behind pace for the other two cases", () => {
    const { container: onPace } = render(<HifzArc passed={4} expected={4} target={12} />);
    expect(onPace.textContent).toContain("on pace");
    const { container: behind } = render(<HifzArc passed={2} expected={4} target={12} />);
    expect(behind.textContent).toContain("behind pace");
  });

  it("draws the pace marker where the expectation sits", () => {
    const { container } = render(<HifzArc passed={2} expected={4} target={12} />);
    expect(container.querySelectorAll("[data-pace]")).toHaveLength(1);
  });

  it("omits the pace marker before the year has an expectation", () => {
    const { container } = render(<HifzArc passed={0} expected={0} target={12} />);
    expect(container.querySelectorAll("[data-pace]")).toHaveLength(0);
  });

  it("renders nothing at all when no target has been set", () => {
    const { container } = render(<HifzArc passed={0} expected={0} target={0} />);
    expect(container.querySelectorAll("[data-node]")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/app/hifz-arc.test.tsx`
Expected: FAIL — "Failed to resolve import ./hifz-arc".

- [ ] **Step 3: Write the implementation**

Create `src/components/app/hifz-arc.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { paceStatus } from "@/lib/hifz/pace";
import { journeyNodes } from "@/lib/viz/journey";

const W = 300;
const H = 60;

const TONE = {
  ok: { stroke: "stroke-ok", fill: "fill-ok", pill: "bg-ok/12 text-ok", word: "ahead of pace" },
  warn: { stroke: "stroke-warn", fill: "fill-warn", pill: "bg-warn/12 text-warn", word: "on pace" },
  danger: {
    stroke: "stroke-danger",
    fill: "fill-danger",
    pill: "bg-danger/12 text-danger",
    word: "behind pace",
  },
} as const;

/**
 * The memorisation list as a road: passed surahs lit along a curve, the
 * student's position at the head of the lit stretch, and the pace marker
 * placed on the same road so "behind" is a distance rather than a word.
 *
 * The full list with names and teacher comments lives on /hifz — this is the
 * glance version for Home.
 */
export function HifzArc({
  passed,
  expected,
  target,
}: {
  passed: number;
  expected: number;
  target: number;
}) {
  const nodes = journeyNodes(target, W, H);
  if (nodes.length === 0) return null;

  const status = paceStatus(passed, expected);
  const tone = TONE[status];
  const done = Math.max(0, Math.min(passed, target));
  const walked = nodes.slice(0, done);
  // The marker sits on the surah the student should be *at*, so index expected-1.
  const paceIdx = expected > 0 ? Math.min(expected, target) - 1 : -1;
  const pace = paceIdx >= 0 ? nodes[paceIdx] : null;
  const here = done > 0 ? nodes[done - 1] : null;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-heading text-lg tabular-nums">
          {passed} <span className="text-muted-foreground">of {target}</span>
        </span>
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", tone.pill)}>
          {tone.word}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${passed} of ${target} surahs passed, ${expected} expected by now`}
      >
        <polyline
          points={nodes.map((n) => `${n.x},${n.y}`).join(" ")}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          className="stroke-foreground/12"
        />
        {walked.length > 1 && (
          <polyline
            points={walked.map((n) => `${n.x},${n.y}`).join(" ")}
            fill="none"
            strokeWidth={3}
            strokeLinecap="round"
            className={cn(tone.stroke, "data-glow")}
          />
        )}

        {pace && (
          <circle
            data-pace
            cx={pace.x}
            cy={pace.y}
            r={5}
            fill="none"
            strokeWidth={1.5}
            strokeDasharray="2 2"
            className="stroke-foreground/45"
          />
        )}

        {nodes.map((n, i) => (
          <circle
            key={i}
            data-node={i < done ? "done" : "todo"}
            cx={n.x}
            cy={n.y}
            r={i < done ? 3.5 : 2.5}
            className={i < done ? tone.fill : "fill-foreground/20"}
          />
        ))}

        {here && (
          <circle
            data-here
            cx={here.x}
            cy={here.y}
            r={5}
            className="fill-foreground data-glow"
          />
        )}
      </svg>

      <p className="text-xs text-muted-foreground">
        Expected by now: <span className="tabular-nums">{expected}</span> surahs
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/app/hifz-arc.test.tsx`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/ibrahimramadan/BSMS Tajweed app"
git add web/src/components/app/hifz-arc.tsx web/src/components/app/hifz-arc.test.tsx
git commit -m "feat(ui): compact hifz journey arc for Home

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Leaderboard ranked bars

**Files:**
- Modify: `src/components/app/leaderboard-panel.tsx:84-101` (the `<li>` body) and `:51` (the panel shell)
- Test: `src/components/app/leaderboard-panel.test.tsx` (append two tests)

The existing eight tests must keep passing — in particular one asserts the self row's className contains `bg-ink`, so **keep that class on the self row**.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("LeaderboardPanel", …)` block in `src/components/app/leaderboard-panel.test.tsx`, before its closing `});`:

```tsx
  it("draws a bar per row, scaled to the percentage", () => {
    const { container } = render(<LeaderboardPanel title="Homework" scopes={[classScope]} />);
    const bars = [...container.querySelectorAll("[data-bar]")];
    expect(bars).toHaveLength(3);
    // Adam is 84% — the bar is the mark, not the rank.
    const mine = container.querySelector("li [data-bar][data-self='true']") as HTMLElement;
    expect(mine.style.width).toBe("84%");
  });

  it("keeps the figure readable as text beside the bar", () => {
    const { container } = render(<LeaderboardPanel title="Homework" scopes={[classScope]} />);
    expect(text(container)).toContain("84.0%");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/app/leaderboard-panel.test.tsx`
Expected: FAIL on the two new tests — `bars` is empty, `mine` is null. The original eight still pass.

- [ ] **Step 3: Rewrite the panel shell and row markup**

In `src/components/app/leaderboard-panel.tsx`, replace the opening panel `div` (line 51):

```tsx
    <div className="glass glass-hover flex flex-col rounded-2xl p-4">
```

Then replace the whole `{shown.map((r) => { … })}` block (lines 84–101) with:

```tsx
            {shown.map((r) => {
              const isSelf = r.name === scope.selfName;
              return (
                <li
                  key={`${r.rank}-${r.name}`}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-sm",
                    isSelf ? "bg-ink font-medium text-primary-foreground" : "text-foreground",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="w-5 shrink-0 text-right tabular-nums opacity-60">
                        {r.rank}
                      </span>
                      <span className="truncate">{r.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{r.pct.toFixed(1)}%</span>
                  </div>
                  {/* The bar makes the gaps visible: three names within a point
                      of each other is a different race from three ten apart. */}
                  <div
                    className={cn(
                      "mt-1 h-1.5 overflow-hidden rounded-full",
                      isSelf ? "bg-primary-foreground/20" : "bg-foreground/10",
                    )}
                  >
                    <div
                      data-bar
                      data-self={isSelf}
                      style={{ width: `${Math.max(0, Math.min(100, r.pct))}%` }}
                      className={cn(
                        "h-full rounded-full transition-[width] duration-700 ease-out",
                        isSelf ? "bg-primary-foreground data-glow" : "bg-chart-3",
                      )}
                    />
                  </div>
                </li>
              );
            })}
```

- [ ] **Step 4: Run the tests to verify all ten pass**

Run: `npx vitest run src/components/app/leaderboard-panel.test.tsx`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
cd "/Users/ibrahimramadan/BSMS Tajweed app"
git add web/src/components/app/leaderboard-panel.tsx web/src/components/app/leaderboard-panel.test.tsx
git commit -m "feat(ui): ranked bars in the leaderboard panels

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Glass shell (student only) and the ambient glow layer

**Files:**
- Modify: `src/components/app/shell.tsx:131-227`
- Modify: `src/app/(student)/layout.tsx`

`AppShell` is shared with `/teacher/*`. The glass treatment must be **opt-in** so teacher screens render exactly as they do today.

- [ ] **Step 1: Add a `glass` prop to AppShell**

In `src/components/app/shell.tsx`, change the `AppShell` signature (line 131) to accept the flag:

```tsx
export function AppShell({
  nav,
  mobileNav,
  userName,
  roleLabel,
  glass = false,
  children,
}: {
  nav: NavItem[];
  /** exactly 5 items for the bottom tab bar */
  mobileNav: NavItem[];
  userName: string;
  roleLabel: string;
  /** Student chrome floats on glass; teacher chrome stays solid. */
  glass?: boolean;
  children: React.ReactNode;
}) {
```

- [ ] **Step 2: Make the three chrome surfaces conditional**

Still in `shell.tsx`, replace the three surface classNames. Desktop sidebar (line 152):

```tsx
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden w-60 flex-col text-sidebar-foreground lg:flex",
          glass
            ? "glass border-y-0 border-l-0 bg-sidebar/70 backdrop-blur-2xl"
            : "bg-sidebar",
        )}
      >
```

Mobile top bar (line 189):

```tsx
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between px-4 lg:hidden",
          glass ? "glass rounded-none border-x-0 border-t-0" : "border-b border-line bg-card",
        )}
      >
```

Mobile bottom tabs (line 217):

```tsx
      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 flex pb-[env(safe-area-inset-bottom)] lg:hidden",
          glass ? "glass rounded-none border-x-0 border-b-0" : "border-t border-line bg-card",
        )}
      >
```

`cn` is already imported at line 15. No other change to this file.

- [ ] **Step 3: Render the glow layer behind the student shell**

Replace the returned JSX in `src/app/(student)/layout.tsx` with:

```tsx
  return (
    <>
      {/* Ambient light the glass refracts. Fixed, inert, behind everything. */}
      <div className="glow-layer" aria-hidden>
        <div className="glow glow-a" />
        <div className="glow glow-b" />
        <div className="glow glow-c" />
      </div>
      <div className="relative z-10">
        <AppShell
          nav={studentNav}
          mobileNav={studentMobileNav}
          userName={profile.full_name}
          roleLabel="Student"
          glass
        >
          {children}
        </AppShell>
      </div>
    </>
  );
```

- [ ] **Step 4: Verify the build and check both shells by eye**

Run: `cd "/Users/ibrahimramadan/BSMS Tajweed app/web" && npm test && npm run build`
Expected: all tests pass, build succeeds.

Then run `npm run dev` and confirm in the browser:
- `/home` — glowing background visible behind a translucent sidebar; content readable.
- `/teacher/home` — chrome looks exactly as before (solid ink sidebar, no glow).
- Toggle the theme with the sun/moon button — both themes readable.

- [ ] **Step 5: Commit**

```bash
cd "/Users/ibrahimramadan/BSMS Tajweed app"
git add web/src/components/app/shell.tsx "web/src/app/(student)/layout.tsx"
git commit -m "feat(ui): glass chrome and ambient glow for student routes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Assemble the Home screen

**Files:**
- Modify: `src/app/(student)/home/page.tsx`

No query changes. Two new derived values (recent marks, capsule segments) come from data the page already loads.

- [ ] **Step 1: Swap the imports**

In `src/app/(student)/home/page.tsx`, replace the two component imports on lines 10–11:

```tsx
import { ProgressRing } from "@/components/app/progress-ring";
import { Sparkline } from "@/components/app/sparkline";
import { SegmentedCapsule, type Segment } from "@/components/app/segmented-capsule";
import { HifzArc } from "@/components/app/hifz-arc";
import { CountUp } from "@/components/app/count-up";
```

This file does not currently import `cn`, and Step 4 needs it. Add it alongside the other lib imports:

```tsx
import { cn } from "@/lib/utils";
```

(`StatTile` and `PaceMarker` are no longer used here but stay in the codebase for the teacher screens — do not delete those files.)

- [ ] **Step 2: Derive the sparkline series and the capsule segments**

First hoist the bucketing, which is about to be needed twice. Replace the
`const currentWeekHwIds = …` / `const overdue = …` block (around lines 75–78) with:

```tsx
  const currentWeekHwIds = new Set((hws ?? []).map((h) => h.id));
  const buckets = bucketHomework(allHomework);
  const overdue = buckets.needsYou.filter(
    (e) => isLate(now, e.homework.due_at) && !currentWeekHwIds.has(e.homework.id),
  );
```

Then, immediately after the `const releasedHomework = …` / `const handedIn = …` block (around line 88–91), add:

```tsx
  // The last six marks, oldest → newest, for the trend line. Marked homework
  // comes back newest-first, so take the head and reverse it.
  const recentMarks = buckets.marked
    .slice(0, 6)
    .map((e) => curriculum.pctByHomeworkId.get(e.homework.id))
    .filter((v): v is number => typeof v === "number")
    .reverse();

  // One capsule segment per homework released so far.
  const segments: Segment[] = releasedHomework.map((e) => {
    const isIn =
      e.submission === "submitted" ||
      e.submission === "auto_marked" ||
      e.submission === "approved";
    if (isIn) return "done";
    return isLate(now, e.homework.due_at) ? "overdue" : "pending";
  });
```

- [ ] **Step 3: Rebuild the "My progress" section**

Replace the whole `<div className="grid gap-3 sm:grid-cols-2">` block inside the "My progress" section (lines 190–197) with:

```tsx
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="glass glass-hover anim-in rounded-2xl p-4" style={{ animationDelay: "60ms" }}>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Homework avg · T{termId}
            </div>
            <div className="mt-3 flex items-center gap-4">
              <ProgressRing value={progress.hwAvg} tone="ok" size={76}>
                <span className="font-heading text-sm">
                  <CountUp value={progress.hwAvg} suffix="%" />
                </span>
              </ProgressRing>
              <div className="min-w-0">
                {recentMarks.length >= 2 ? (
                  <>
                    <Sparkline values={recentMarks} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      last {recentMarks.length} marked
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {progress.hwAvg === null
                      ? "no marks yet"
                      : "one mark so far — the trend appears at two"}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="glass glass-hover anim-in rounded-2xl p-4" style={{ animationDelay: "140ms" }}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Submitted
              </span>
              <span className="font-heading text-lg tabular-nums">
                {handedIn}
                <span className="text-sm text-muted-foreground"> of {releasedHomework.length}</span>
              </span>
            </div>
            <div className="mt-3">
              <SegmentedCapsule segments={segments} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              one block per homework released so far
            </p>
          </div>
        </div>
```

- [ ] **Step 4: Swap the hifz and strikes panels onto glass**

Replace the `<div className="grid gap-6 lg:grid-cols-2">` block (lines 200–226) with:

```tsx
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">My hifz</h2>
          <div className="glass glass-hover anim-in rounded-2xl p-4" style={{ animationDelay: "220ms" }}>
            {progress.hifz ? (
              <>
                <HifzArc
                  passed={progress.hifz.passed}
                  expected={expected}
                  target={progress.hifz.target}
                />
                <Link href="/hifz" className="mt-3 inline-block text-xs text-ink-2 underline underline-offset-4">
                  See every surah and teacher feedback →
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your teacher hasn&apos;t set a hifz target yet.
              </p>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">Strikes</h2>
          {/* The panel itself carries the warning: a clear term looks like every
              other panel, a struck term glows red before a word is read. */}
          <div
            className={cn(
              "glass glass-hover anim-in rounded-2xl p-4",
              progress.strikes.length > 0 && "border-danger/35 shadow-[0_0_28px_-8px_var(--danger)]",
            )}
            style={{ animationDelay: "300ms" }}
          >
            <StrikeDots strikes={progress.strikes} />
            <p className="mt-3 text-xs text-muted-foreground">
              Strikes reset at the start of each term.
            </p>
          </div>
        </section>
      </div>
```

- [ ] **Step 5: Put the remaining panels on glass**

Three more class swaps in the same file, leaving all logic untouched:

1. The overdue section (line 107) — `className="rounded-lg border border-danger/25 bg-danger/5 p-4"` becomes:
```tsx
        <section className="glass anim-in rounded-2xl border-danger/30 bg-danger/10 p-4">
```
2. Each this-week lesson card (line 148) — `className="group rounded-lg border border-line bg-card p-4 transition-colors hover:border-ink/30"` becomes:
```tsx
                <Link key={l.id} href={`/lessons/${l.id}`}
                  className="glass glass-hover group anim-in rounded-2xl p-4">
```
3. The "no lessons released" fallback (line 172) — `className="rounded-lg border border-line bg-card p-4 text-sm text-muted-foreground"` becomes:
```tsx
          <p className="glass rounded-2xl p-4 text-sm text-muted-foreground">
```

- [ ] **Step 6: Verify**

Run: `cd "/Users/ibrahimramadan/BSMS Tajweed app/web" && npm test && npm run build`
Expected: all tests pass, build succeeds with no type errors (watch for an unused-import lint error on `StatTile`/`PaceMarker` — both imports must be gone from this file).

Then `npm run dev` and check `/home` in both themes and at 390px width.

- [ ] **Step 7: Commit**

```bash
cd "/Users/ibrahimramadan/BSMS Tajweed app"
git add "web/src/app/(student)/home/page.tsx"
git commit -m "feat(home): glass panels, ring, sparkline, capsule and hifz arc

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: Assemble the Progress screen

**Files:**
- Modify: `src/app/(student)/progress/page.tsx`
- Modify: `src/components/app/marked-homework.tsx:52` (list container only)

- [ ] **Step 1: Import the bars**

Add to the imports at the top of `src/app/(student)/progress/page.tsx`:

```tsx
import { TermBars } from "@/components/app/term-bars";
import { CountUp } from "@/components/app/count-up";
```

- [ ] **Step 2: Replace the term table with the chart, keeping the table underneath**

Replace the entire "Term by term" `<section>` (lines 44–98) with:

```tsx
      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Term by term
        </h2>

        <div className="glass anim-in rounded-2xl p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                End of year
              </div>
              <div className="font-heading text-3xl">
                <CountUp value={full.eoyPct} decimals={1} suffix="%" />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">mean of the three terms</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-chart-1" /> exam (80%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-chart-3" /> homework (20%)
              </span>
            </div>
          </div>

          <div className="mt-6">
            <TermBars terms={full.terms} currentTermId={termId} />
          </div>
        </div>

        {/* The exact figures stay one tap away — the chart shows the shape of
            the year, the table answers "what precisely did I get". */}
        <details className="glass rounded-2xl px-4 py-3">
          <summary className="cursor-pointer text-xs text-ink-2 underline underline-offset-4">
            Show the exact marks
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2.5 font-normal">Term</th>
                  <th className="px-2 py-2.5 text-right font-normal">Homework</th>
                  <th className="px-2 py-2.5 text-right font-normal">Exam</th>
                  <th className="px-2 py-2.5 text-right font-normal">Term %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {full.terms.map((t) => (
                  <tr key={t.termId} className={t.termId === termId ? "bg-foreground/4" : undefined}>
                    <td className="px-2 py-2.5">
                      Term {t.termId}
                      {t.termId === termId && (
                        <span className="ml-2 text-xs text-muted-foreground">current</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {pct(t.hwAvg) ?? <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {t.examScore === null ? (
                        <span className="text-muted-foreground/50">not sat</span>
                      ) : (
                        `${t.examScore}/${t.examMax}`
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right font-medium tabular-nums">
                      {pct(t.termPct) ?? <span className="text-muted-foreground/50">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <p className="text-xs text-muted-foreground">
          Term % is 80% exam and 20% homework. It only appears once the exam is entered.
        </p>
      </section>
```

- [ ] **Step 3: Put the marked-homework list and empty state on glass**

In `src/app/(student)/progress/page.tsx`, replace the empty-state paragraph
(lines 110–112):

```tsx
          <p className="glass rounded-2xl p-4 text-sm text-muted-foreground">
            Nothing marked yet.
          </p>
```

Then in `src/components/app/marked-homework.tsx`, put the row list itself on
glass — replace line 52:

```tsx
            <ul className="glass divide-y divide-line overflow-hidden rounded-2xl">
```

Nothing else in that file changes: the sort dropdown, the term grouping, the
live region and `HomeworkRow` all stay exactly as they are.

- [ ] **Step 4: Verify**

Run: `cd "/Users/ibrahimramadan/BSMS Tajweed app/web" && npm test && npm run build`
Expected: all tests pass, build succeeds.

Then `npm run dev` and check `/progress`: three bars with the current term outlined and labelled "live", end-of-year figure as the hero, table expanding from the disclosure, both themes, 390px width.

- [ ] **Step 5: Commit**

```bash
cd "/Users/ibrahimramadan/BSMS Tajweed app"
git add "web/src/app/(student)/progress/page.tsx" web/src/components/app/marked-homework.tsx
git commit -m "feat(progress): term bars with the exact table one tap away

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 15: Full verification pass

**Files:** none changed unless a defect is found.

- [ ] **Step 1: Run the whole suite**

Run: `cd "/Users/ibrahimramadan/BSMS Tajweed app/web" && npm test`
Expected: PASS — every existing test plus the ~36 new ones. Zero failures.

- [ ] **Step 2: Lint and build**

Run: `npm run lint && npm run build`
Expected: no errors. Unused imports of `StatTile`/`PaceMarker` in the student home would surface here.

- [ ] **Step 3: Manual pass on localhost**

Run `npm run dev`, then walk this checklist and note anything that fails:

- `/home` and `/progress` in **light** theme — text readable on every panel, no washed-out glass.
- Both in **dark** theme — same.
- Set the OS/browser to dark with no stored preference (a fresh private window) — the app opens dark.
- Click the sun/moon toggle — it still overrides and persists across a reload.
- Narrow to 390px — no horizontal scrollbar; bars, capsule, arc and leaderboards all fit.
- macOS System Settings → Accessibility → **Reduce motion** on, reload — glows stand still, panels appear without rising, numbers show final values.
- `/teacher/home` — unchanged from before this branch (solid chrome, no glow).

- [ ] **Step 4: Confirm nothing is queued for production**

Run: `cd "/Users/ibrahimramadan/BSMS Tajweed app" && git status --short && git log --oneline main..feat/liquid-glass-redesign`
Expected: a clean tree and the branch's commits listed. **Do not push, and do not merge to `main`** — going live is the user's separate decision.

- [ ] **Step 5: Report back**

Summarize for the user: what shipped on the branch, anything from the manual checklist that needs a design call, and the reminder that `/home` and `/progress` are visible on localhost only until they choose to merge.

---

## Notes for the implementer

- **If `backdrop-filter` makes text hard to read on a busy glow**, raise the panel opacity in `--glass-bg` rather than adding per-component overrides — one token, both screens.
- **If the glow layer sits above content**, the `relative z-10` wrapper in `(student)/layout.tsx` was dropped; it is what lifts the shell above `.glow-layer`'s `z-index: 0`.
- **If a test using `matchMedia` fails**, jsdom's built-in returns `matches: false`; the stub in `use-count-up.test.tsx` is the pattern to copy.
- **Cut from v1 deliberately:** leaderboard movement arrows (▲2) need rank-history storage that does not exist. Do not fake them from current data.
