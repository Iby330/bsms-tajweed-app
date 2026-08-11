# Liquid Glass Redesign — Student Home & Progress

**Date:** 2026-08-11 · **Status:** approved in brainstorm · **Branch:** `feat/liquid-glass-redesign`

## Goal

Remake the two most data-heavy student screens — **Home** and **Progress** — in an
Apple-liquid-glass design language, replacing bare numbers and percentages with
animated data visualization. Presentation-only: no backend, query, or data-model
changes. Built directly in the app, previewed on localhost; pushed to GitHub only
after approval (production untouched until a separate merge-to-`main` decision).

## Decisions made during brainstorm

| Question | Decision |
| --- | --- |
| Scope | Student **Home + Progress**, plus the shell/nav so the frame matches |
| Aesthetic | **B — Ink Glass**: dark-first, ambient glows behind translucent panels |
| Theming | Adaptive: follow browser (`prefers-color-scheme`) by default; manual toggle overrides. Light mode is a first-class sibling, not a fallback |
| Dataviz | A ring+sparkline ✓ · B segmented capsule ✓ · C term bars ✓ · E hifz journey ✓ · F leaderboard bars ✓ · **D marks-timeline declined** (marked homework stays a styled list) |
| Motion | **Ambient life** — entrance animations + slow drifting glows + hover lift; no scroll-triggered showcase effects |
| Build approach | Restyle in-app on a branch, iterate on localhost (user's own choice over HTML drafts) |
| CINEMATIC.md | Explicitly excluded — not tailored to this project |

## Design language: "Ink Glass, adaptive"

**Dark (signature).** Deep-ink ground (deeper than current `#151a28`). Three ambient
glows — indigo `#3b5bdb`, mint `#5fa98c`, gold `#c9a45c` — as blurred divs at low
opacity drifting on 30–45s loops behind the content. Panels: translucent ink
(~45% opacity) with `backdrop-filter: blur(20px) saturate(1.6)`, hairline light
borders (`rgba(232,236,242,.12–.14)`), soft deep shadows. Data strokes luminous
(subtle `drop-shadow` glow on ring/path strokes).

**Light.** Same architecture in daylight: soft slate ground, the same three glows at
whisper opacity, white frosted panels (~55% white, same blur recipe), ink text,
brand `--ok/--warn/--danger` data colors. Switching themes must read as the same
design, lit differently.

**Tokens.** New CSS variables in `globals.css`, each with light and `.dark` values,
beside the existing brand tokens:
`--glass-bg`, `--glass-border`, `--glass-shadow`, `--glow-1`, `--glow-2`, `--glow-3`.
Existing semantic tokens (`--ok`, `--warn`, `--danger`, `--chart-*`) remain the only
source of data colors. No hardcoded colors in components.

**Unchanged.** Archivo headings / Inter body / Amiri Quran Arabic; the film-grain
overlay; the existing radius scale (panels move to its `2xl/3xl` end).

**Theme wiring.** `layout.tsx` ThemeProvider: `defaultTheme="system"`, `enableSystem`.
The existing sun/moon toggle in `shell.tsx` keeps working as a persisted manual
override (next-themes behavior).

## Screens

### Home (`(student)/home/page.tsx`)

Information architecture unchanged — greeting, overdue, this week, my progress,
hifz, strikes, leaderboards — every section re-housed in glass:

- **Homework avg tile** → animated **progress ring** (fills on load) + **six-week
  sparkline** of the most recent marked homework, sourced from the per-homework
  percentages the page already loads (`curriculum.pctByHomeworkId`). No new queries.
- **Submitted tile** → **segmented capsule**: one segment per released homework —
  filled (ok), late (warn), empty. Count stays visible beside it.
- **Hifz** → compact **journey path** (evolves `pace-marker.tsx`): passed surah
  nodes lit along a curve, "you" node, pace marker placed spatially on the same path.
- **Strikes** → same dot logic (`strike-dots.tsx`), glass treatment; danger glow
  only when at least one strike exists.
- **Leaderboards** → **ranked proportional bars**, self row highlighted with a glow.
  Scope dropdowns unchanged. **Movement arrows are cut from v1** — rank history
  isn't stored; they become a future backend feature (weekly rank snapshots).
- Overdue panel: glass with a danger edge glow; renders nothing when empty (as now).
- This-week lesson cards: glass cards, same watched/countdown/handed-in logic.

### Progress (`(student)/progress/page.tsx`)

- **Term by term** → **stacked glass bars**, one per term, showing the 80/20
  exam–homework composition; current term outlined and labeled "live"; end-of-year
  percentage as the hero number of the screen.
- The exact existing table moves into a collapsible below the chart — no
  information lost.
- **Marked homework** stays a list (decision D): glass rows, mark pills, same sort
  dropdown.

### Shell (`components/app/shell.tsx`)

`AppShell` is shared with teacher routes, so the re-skin is **opt-in**: a `glass`
variant prop, enabled only by the student layout. Student pages get the floating
translucent rail and the ambient glow layer (rendered by the student layout, not
the shell); teacher routes keep the current chrome untouched. Navigation
structure and links unchanged.

## Components

New (all hand-rolled SVG/CSS, **no chart library**):
- `ProgressRing` — animated stroke-dashoffset ring, null-safe empty state
- `Sparkline` — polyline of last ≤6 marks; hidden below 2 points
- `SegmentedCapsule` — n segments with ok/warn/empty states
- `TermBars` — stacked exam/homework bars with live-term outline
- Shared glass panel styling as a standalone `glass` utility class in
  `globals.css` — `ui/card.tsx` stays untouched (it serves out-of-scope screens)
- A small `useCountUp` rAF hook (~20 lines) for headline numbers

Changed: `stat-tile.tsx` (ring/capsule variants), `pace-marker.tsx` → journey path,
`leaderboard-panel.tsx` (bar rows), `strike-dots.tsx` (re-skin), `shell.tsx`
(glass rail), `globals.css` (tokens + glow layer + keyframes), `layout.tsx`
(system theme).

## Motion

- Entrance: panels fade-up with ~80ms stagger; rings/bars animate to value;
  headline numbers count up via `useCountUp`.
- Ambient: the three glows drift on 30–45s CSS keyframe loops, `transform`-only.
- Hover: subtle lift + border brighten on interactive cards.
- **`prefers-reduced-motion`: everything renders instantly in final state.**
- Performance: `backdrop-filter` on panels only, never nested; verify smoothness
  on localhost before push.

## Edge cases

- No marked homework → ring renders empty track + "no marks yet" (no fake 0%).
- Exam not sat → term bar shows homework portion only, "live" outline, no term %.
- No hifz target → glass empty state with the current message.
- One released homework → capsule degrades to one wide segment; sparkline hidden
  below 2 points.
- Overdue empty → section renders nothing (unchanged).

## Accessibility

- Body text always sits on a panel, never raw over glows; maintain current AA
  contrast in both themes (ink/page 8.14:1 today — glass panels must not drop
  effective contrast below AA).
- Reduced motion honored throughout; ring/bars carry text equivalents
  (values remain in the DOM as text, viz is enhancement).

## Testing & verification

- Update existing component tests: `strike-dots`, `leaderboard-panel`, `hifz-*`.
- New tests for null/empty branches of `ProgressRing`, `Sparkline`,
  `SegmentedCapsule`, `TermBars`.
- Gate before any push: full test run + `npm run build` green, manual localhost
  pass in **both themes** and at **mobile width** (students are mostly on phones).

## Rollout

1. All work on `feat/liquid-glass-redesign` (off `main`).
2. User reviews on localhost (`npm run dev`).
3. Push to GitHub only after approval — **a branch push deploys nothing**; only
   `main` releases to https://bsms-tajweed.netlify.app.
4. Merge to `main` (live to students) is a separate explicit decision.

## Out of scope (this phase)

- Teacher screens, courses grid, lesson player, hifz detail page (design language
  extends later once approved on the two flagship screens).
- Leaderboard movement arrows (needs rank-snapshot storage).
- Marks-timeline chart for marked homework (declined).
- Any backend/schema/query change.
