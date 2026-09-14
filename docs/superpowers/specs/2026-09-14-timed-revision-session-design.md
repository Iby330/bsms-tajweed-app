# Timed revision sessions — design

**Date:** 2026-09-14
**Builds on:** `2026-08-14-hifz-peer-review-design.md` (pairs, draft sessions, the mushaf logger)
**Status:** draft for review

## Goal

A revision pair sits together. A (the reviewer) times B (the reciter) and the
app records how long B took and how much B actually revised — where they
started, the exact ayah they reached, and the pages that covers. The school's
target is a hizb in fifteen minutes; the app shows the clock against that.

The design principle, settled in brainstorming: **the mushaf is the picker.**
A already opens the page B starts on to follow along, and already turns pages
as B recites. So nothing is chosen up front. One press starts the clock; when
B stops, one tap on the ayah marker says where. Everything else is derived.

## Non-goals

- No planned range before starting, and no confirm-or-edit step afterwards.
  There is nothing to confirm because nothing was planned; the session records
  what happened.
- No per-student or per-teacher target. Fifteen minutes for a hizb is a
  constant. Making it configurable is a later change with an obvious seam.
- No reciter-side timer. B sees the result afterwards, in the feedback view,
  not a live clock on their own device.
- No mid-page start precision. The start is the first ayah on the page open
  when the clock starts (see *Decisions*).

## The flow

All of this lives in the existing logger: the sticky header that today reads
"Listening to B · N mistakes · Finish", above the printed mushaf page.

1. **Before.** The header gains a **Start** button. It already knows the open
   page, and from the page the hizb, so it shows "Hizb 60 · target 15:00"
   without anything being chosen.
2. **Running.** Start records where B began and starts the clock. The header
   shows the elapsed time against the target, the pages covered so far, and
   the mistake count. A turns pages and logs mistakes exactly as now.
   **Pause** and **Resume** are available throughout.
3. **Stopped.** **Stop** pauses the clock and enters *pick mode*: every ayah
   marker on the open page glows and a bar reads "Tap the ayah B stopped on".
   One tap records the endpoint. The header then reads "B revised An-Nas →
   Al-A'la 12 · 17 pages · 14:32". **Resume** leaves pick mode, clears the
   endpoint, and restarts the clock — B carried on after all.
4. **Finish.** The existing Finish dialog (flags, overall note, submit). If
   the clock is still running it is stopped. If no ayah was tapped, the
   endpoint defaults to the last ayah on the open page.

## Data

Six nullable columns on `revision_sessions`, one migration, nothing new to
create. All are null for a session whose clock was never started, which is
how sessions submit today and must keep working.

| column | type | meaning |
| --- | --- | --- |
| `timer_started_at` | timestamptz | non-null while the clock is running |
| `elapsed_ms` | int, default 0 | time accumulated across pauses |
| `from_surah`, `from_ayah` | int | where B began |
| `to_surah`, `to_ayah` | int | the ayah B reached |

Constraints: `elapsed_ms >= 0`; `from_*` both null or both set; `to_*` both
null or both set; `to_*` set implies `from_*` set.

**The clock** is `elapsed_ms + (now − timer_started_at)` while running, and
`elapsed_ms` while paused. The server holds the truth and the client derives
the display, so a reload, or A picking up a second device, shows the same
time. Pause folds the running span into `elapsed_ms` and nulls
`timer_started_at`; Resume sets it again.

**The range is stored in memorisation order**, which runs *down* the mushaf:
students learn An-Nas (114) first and work towards Al-Mulk (67). `from` is
the higher surah, read from `from_ayah` to its end; every surah between is
read in full; `to` is the lower surah, read from its first ayah to `to_ayah`.
When both ends fall in the same surah, `from_ayah <= to_ayah`. A `to` that
sits before `from` in this order is rejected with a readable error and the
bar asks A to tap again.

**Pages covered are derived, never stored.** `quran_words` maps every ayah
to its page, so the pages a range touches are the distinct pages of the ayahs
it contains. A pure helper computes this from the range and a
`(surah, ayah) → page` lookup, and is the single source for the header count,
the session card, and the heatmap.

**The hizb** is `hizbOf(from_surah)`. The target is the constant 15 minutes.

## Server actions

In `lib/hifz/review-actions.ts`, beside `logMistake` and `submitSession`,
each guarded by the same reviewer-owns-draft RLS that already lets a reviewer
update their draft:

- `startTimer(sessionId, from)` — sets `from_*` (the caller passes the first
  ayah on the open page), `timer_started_at = now()`, and leaves `elapsed_ms`
  as is, so Start after a Stop behaves as Resume.
- `pauseTimer(sessionId)` — folds the running span into `elapsed_ms`, nulls
  `timer_started_at`. Stop and Pause are the same action; the difference is
  client state (pick mode).
- `resumeTimer(sessionId)` — sets `timer_started_at = now()` and nulls
  `to_*`.
- `setReached(sessionId, to)` — validates the order rule and sets `to_*`.
- `submitSession(sessionId, flags, note, page)` — gains the open page. If the
  clock is running it is paused first. If `from_*` is set and `to_*` is not,
  `to_*` defaults to the last ayah on `page` (looked up server-side).
  Otherwise unchanged.

Every action returns the session's new timer/range state so the client can
reconcile without a refetch.

## Client

**`ReviewLogger`** owns the header. It receives the session's timer and range
fields as props (the draft is already fetched server-side) and holds local
state for the display tick and pick mode. A one-second interval runs only
while the clock is running.

Header states:

| state | left | right |
| --- | --- | --- |
| idle | Listening to B · Hizb 60 · target 15:00 | Start · Finish |
| running | 06:41 of 15:00 · 4 pages · 2 mistakes | Pause · Stop |
| paused | 06:41 · paused · 4 pages | Resume · Stop |
| picking | 14:32 · stopped | Resume · Finish |
| reached | B revised An-Nas → Al-A'la 12 · 17 pages · 14:32 | Resume · Finish |

**Pick mode and the reader.** `MushafReader` gains a `pickMode` prop. When
set, ayah markers get a glow class and `onWordTap` is only invoked for
markers; word taps are ignored. The bar beneath the page states the mode.
This is the one place two gestures share a target — a marker tap means
"whole-ayah mistake" while logging and "reached here" while picking — and
explicit mode plus the bar is how they are kept apart. Leaving pick mode
(Resume) restores logging behaviour.

**Finish** passes the open page to `submitSession` so the end-of-page default
can be resolved server-side.

## What the reciter and teacher see

One shared formatter, `describeSession(session, pagesCovered)`, produces the
line "An-Nas → Al-A'la 12 · 17 pages · 14:32 · on target". It is used
wherever a session is listed: the reciter's feedback view and the teacher's
per-student view. "On target" appears only when the range covers at least one
whole hizb and the time is within the target; otherwise the line ends at the
time. A session with no clock shows the line it shows today.

The heatmap's `collectDays` takes pages per session as an input. The activity
query computes them with the same pages-covered helper, so a timed session
lights its day by pages, not just by the first band.

## Decisions

- **End-of-page default.** If A forgets to tap, Finish takes the last ayah on
  the page A is looking at. This is right to within a few lines and costs
  nothing; the alternative, blocking Finish until a tap, punishes the common
  case to serve the rare one.
- **No pre-start precision.** A mid-page start rounds to the top of the page.
  The brainstorm mockup offered a pre-Start marker tap; it is dropped here
  because before Start a marker tap already means "whole-ayah mistake" and a
  second meaning would need a second mode. Students recite from the top of a
  surah; the page A opens is the right page.
- **Marker taps change meaning in pick mode.** Accepted, with the mode made
  visible by the glow and the bar.
- **Ranges follow memorisation order.** The direction the programme runs.
- **Pages derived, not stored.** One helper, one truth, no drift.

## Edge cases

- Clock never started: submits as today; no range, no pages, no target line.
- Finish while running: stops the clock, then defaults the endpoint.
- Finish while paused: keeps the paused time.
- Page turns never touch the range. Only Start and the tap do.
- Resume after a tap clears the endpoint; a second Stop asks again.
- Two devices: the server state wins on every action's response.
- Reload mid-session: the header rebuilds from the draft's fields.

## Testing

- **Pure helpers, unit-tested:** the clock arithmetic (running, paused, after
  several pauses); pages-covered for a same-surah range, a multi-surah range,
  and a range spanning a page boundary; the end-of-page default; the order
  rule; `describeSession` including when "on target" appears.
- **Component tests:** `ReviewLogger`'s five header states from props; pick
  mode ignoring word taps and forwarding marker taps; the reader's glow class.
- **Actions:** exercised the way `logMistake` and `submitSession` are today.

## Migration

`web/supabase/migrations/<next>_timed_sessions.sql`, idempotent like 0022:
the six columns and three constraints. Applied with
`execution/apply_migration.ts`.
