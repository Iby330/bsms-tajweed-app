# Course video grid — real videos, and modules as cards

**Date:** 2026-08-06
**Status:** approved, ready to plan

## Problem

Two things, and they only make sense together.

1. **Every `youtube_id` in the database is null.** The original seed left them null "until
   the channel re-uploads after summer" (`0002_reference_seed.sql`). The channel has since
   published 24 course videos, but the app has never been told. Students see
   `▸ Video coming soon` on lessons that exist and are watchable today.
2. **`/courses/[term]/[series]` is a flat list of text rows.** `ModuleRow` renders each week
   as a bordered row of small text links. Once real videos exist, a text list wastes the
   single strongest affordance a video course has — the thumbnail. The screen should read
   like a school course page, not a table of contents.

Fixing (1) without (2) leaves 24 videos behind a text link. Fixing (2) without (1) builds a
thumbnail grid with no thumbnails.

## What is actually on the channel

Channel `@bsmstajweed` (`UCkrnj1JKnDNkogIiCCFmTvg`) has 57 public videos. 24 are curriculum;
the other 33 are promos, Shorts, testimonials and Recitation-of-the-Week, and are ignored.

The 24 map to lessons **1:1 by episode number**, verified title-by-title against the seed:

| Series | Videos | Lessons | Placement |
|---|---|---|---|
| Tajweed | Ep. 1–15 | Tajweed 1–15 | T1 W1–8, T2 W1–7 |
| Umm al-Kitāb | Ep. 1–9 | Umm al-Kitāb 1–9 | T1 W1–9 |

The match is unambiguous — e.g. lesson `Tajweed 3 — … Idhaar Halqy` ↔ video
`Tajweed: Ep 3 - Ghunna: Idhaar Halqi`. There is no fuzzy matching to get wrong.

**13 lessons get no video:** Tajweed 16–21 (6) and TFP 1–7 (7). They are not on the public
channel. Per the channel owner these were likely made unlisted or removed rather than never
recorded, and are expected back. The design must therefore treat "no video yet" as a normal,
temporary state — not an error, and not a permanent hole.

## Constraint discovered during design: private videos cannot be embedded

This governs how the channel must be configured, so it is recorded here rather than left as
tribal knowledge.

- **Unlisted** — embeds and plays normally for anyone with the id; hidden from the channel's
  Videos tab and from search. Thumbnails work. **This is the correct setting for any course
  video that should not be publicly listed.**
- **Private** — cannot be embedded anywhere. YouTube serves private videos only to explicitly
  invited signed-in Google accounts, and blocks embedding even for them. The player renders
  "Video unavailable" and the thumbnail 404s.

There is no credential, link format, or API key that makes a private video embeddable. If a
course video is set to Private, the app cannot show it, and the only fix is on YouTube.

Practical consequence: the 13 missing videos, **if they are unlisted rather than deleted, are
already usable** — they only need their ids pasted in. Recovering them is a content task
(YouTube Studio → Content → filter Unlisted), not a code task, and needs no schema change.

## Design

### 1. Backfill the video ids — migration `0008_lesson_videos.sql`

A migration, not manual paste-in through the teacher UI. The teacher UI path
(`LessonVideoInput`, already built and working) is 24 manual pastes that must be redone on
every database rebuild. The mapping is verified and deterministic, so it belongs in schema
history alongside the seed that created the null.

Rows are addressed by `(series, term, week)` — the placement `import_forms.ts:weekFor()`
already computes — rather than by title regex, so a later title edit cannot silently break
the migration.

The statement is a plain `UPDATE`, therefore idempotent and safe to re-run, which
`apply_migration.ts` requires of every migration. Applied with:

```
npx tsx execution/apply_migration.ts web/supabase/migrations/0008_lesson_videos.sql
```

**Verification is part of the task, not an afterthought:** exactly 24 lessons must have a
non-null `youtube_id` afterwards, and each must be one of the 24 known ids. A migration that
updates 0 rows and a migration that updates 24 look identical from the outside otherwise —
the same silent-success failure mode `LEARNINGS.md` already records for the eval harness.

The teacher UI keeps working unchanged and remains the route for adding the remaining 13.

### 2. Modules as cards — replace `ModuleRow` with `ModuleCard`

`/courses/[term]/[series]` becomes a responsive grid: 1 column on mobile, 2 at `md`, 3 at
`lg`. Same data, same order, same lock rules — presentation only.

```
┌──────────────────────────────┐
│ Idhaar Halqy          WEEK 3 │   thin strip: title left, week right
├──────────────────────────────┤
│                            ✓ │   16:9 thumbnail, watched tick in corner
│      [ thumbnail 16:9 ]      │
├──────────────────────────────┤
│ ▸ Watch       HW 3 · Marked  │   actions
└──────────────────────────────┘
```

**Title strip** — one line, not two. Title truncates with an ellipsis (`line-clamp-1`); the
week label is `shrink-0` so a long title can never push it off. `moduleTitle()` returns `""`
for the TFP rows, which genuinely carry no title beyond a number — those cards show the week
label alone rather than an empty strip.

**Thumbnail** — `https://i.ytimg.com/vi/<id>/hqdefault.jpg`. No API key, no auth, no quota.

`hqdefault` is 480×360 (4:3) with the 16:9 frame letterboxed inside it — 45px bars top and
bottom, exactly 12.5% each. Rendered with `object-cover` in a 16:9 box, the overflow crop is
`(0.75 − 0.5625) / 0.75 = 25%`, i.e. 12.5% off each edge: precisely the bars, no video
content lost. This is why `hqdefault` is used rather than `maxresdefault`, which is true 16:9
but **only exists if the source was uploaded in HD** — unverifiable across 24 videos, and a
404 on a card is worse than a crop that is provably exact.

**No-video placeholder** — a muted tile at the same 16:9 ratio carrying the series name, so
the grid stays even and the 13 video-less modules do not read as broken. The moment an id is
added the tile becomes a real thumbnail with no code change, because both branches are driven
by `youtube_id` alone.

**Locked weeks** — carried over from the existing design, restyled: a dimmed card with the
unlock date in the thumbnail slot. Locked modules still render; the weekly-release mechanic
is only credible if you can see what is coming.

**Watched tick** — a corner mark on the thumbnail, keeping the existing `✓` convention rather
than inventing a second one.

**Links** — the whole card is one link to `/lessons/<id>`. The homework chip is a separate
link to `/homework/<n>` nested inside it. Nested anchors are invalid HTML, so the card is a
positioned wrapper with the lesson link stretched behind it (`::after` overlay) and the
homework chip raised above — the standard fix, and the reason this is called out is that
naively nesting two `<Link>`s renders but breaks keyboard navigation and hydration.

### Plain `<img>`, not `next/image`

`next/image` would need `remotePatterns` for `i.ytimg.com` and routes every thumbnail through
the Next optimizer. These are already correctly-sized JPEGs on Google's CDN; re-optimizing
them adds a server hop and a cache for no gain. A plain `<img loading="lazy">` inside an
aspect-ratio wrapper gives lazy loading and zero layout shift with no config change.

Revisit only if AVIF/WebP conversion is later wanted.

## Scope

**In:** `0008_lesson_videos.sql`; new `ModuleCard` component; grid layout on
`/courses/[term]/[series]`; a `thumbnailUrl()` helper in `lib/lessons/youtube.ts` next to the
existing `parseYouTubeId()`.

**Out:** the teacher curriculum page (deliberately a single-page audit list so gaps stay
scannable — unchanged from the previous spec); the lesson player; the homework form; the
database schema; `tree.ts` and its queries. `ModuleRow` is deleted once nothing imports it.

Recovering the 13 missing video ids is a **content task for the channel owner**, not part of
this build. The placeholder is designed so that work can land later with no code change.

## Testing

`thumbnailUrl()` is pure and gets unit tests alongside the existing `parseYouTubeId()` suite
in `youtube.test.ts` — TDD, test first.

`tree.ts` is untouched, so its suite must stay green unchanged; if it goes red, the change
has leaked past presentation and that is the signal to stop.

Card rendering is verified in the browser against the real database, at all three
breakpoints, covering every state the grid can be in:

- a module with a video (thumbnail renders, crop is clean, no letterbox bars)
- a module without one (placeholder, grid stays even)
- a locked week (dimmed, unlock date)
- a watched module (tick)
- a module with no title (TFP — week label alone, no empty strip)
- keyboard tab order into the card and out to the homework chip

Lint and production build must pass.
