# Learnings

Durable, cross-cutting knowledge base of failures and learnings from running skills,
directives, and execution scripts in this workspace. Unlike the ephemeral per-skill
journals (`.claude/skill-research/<name>/journal.md`, which get consumed and archived),
this file is permanent and NOT scoped to one skill — it's for things worth knowing
before starting ANY new task, building a new skill, or redoing an old one, in this
chat or a brand new one.

**Read this before:** building a new skill, redoing a task that failed before, or
starting work in a new domain covered below.

**Write to this when:** the reviewer (`directives/improve_skill.md`) finds a
journalled problem that's broadly reusable — not specific to one skill's internals,
but a fact about an external API, a tool, an environment quirk, or a failed approach
that would bite ANY future skill touching the same thing. One line per entry, most
recent first within its section. Skill-specific fixes stay in that skill's own
directive/changelog instead — only promote here if a *different* skill could hit it too.

This file is also periodically pulled into a cross-workspace global learnings digest
(`~/.claude/GLOBAL_LEARNINGS.md`) — keep entries self-contained (a reader from a
different project should understand each line without extra context).

---

## APIs & external services

- [2026-07-31] Supabase: the CLI is NOT installed on this machine. Apply SQL/migrations via the Management API — `POST https://api.supabase.com/v1/projects/<ref>/database/query` with `Authorization: Bearer $SUPABASE_ACCESS_TOKEN` and `{"query": "..."}`. Success is 201 + a JSON array; non-2xx must be treated as failure (body carries `message`). Wrapped in `execution/apply_migration.ts`. (source: apply_migration)
- [2026-07-31] Supabase Storage: overwriting an object (`upload(..., {upsert: true})`) is an UPDATE on `storage.objects`, so an insert-only RLS policy fails with a policy violation. Any bucket users re-upload to needs UPDATE *and* DELETE policies, not just INSERT. (source: voice notes)
- [2026-07-31] Supabase: `upsert(..., {onConflict: "a,b"})` needs a real UNIQUE INDEX on exactly those columns, and Postgres needs BOTH insert and update RLS policies for the upsert to pass. (source: voice notes)

## Tools & environment

- [2026-07-31] Playwright/chrome-devtools MCP here attaches to an EXISTING Chrome on port 9222 rather than launching one — if nothing is listening it fails with `ECONNREFUSED 127.0.0.1:9222`. Start one yourself: `"/Applications/Google Chrome 2.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --headless=new --user-data-dir=<scratch>`. The app is "Google Chrome 2.app"; plain "Google Chrome.app" does not exist here. Add `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` to test microphone features and `--autoplay-policy=no-user-gesture-required` for video. (source: BSMS UI verification)
- [2026-07-31] Two agent sessions sharing one CDP browser fight over the same login cookie — you get silently signed out and reauthenticated as the other session's user mid-test. If sign-in state flips unexpectedly, suspect a second session before debugging the auth code. (source: BSMS UI verification)
- [2026-07-31] `tsx` does not load `.env.local`. Read it manually (see `execution/seed_demo.ts`) rather than assuming `process.env` is populated. (source: eval_marking)
- [2026-07-31] Next.js 16 renamed Middleware to **Proxy**: the file is `src/proxy.ts` exporting `proxy()`, it defaults to the Node runtime, and setting the `runtime` config option there throws. Bundled docs live in `node_modules/next/dist/docs/` — read them, this version differs from training data. (source: session refresh)

## Failed approaches (don't retry these)

- [2026-07-31] YouTube IFrame API: driving watch-progress off `onStateChange` (wait for PLAYING, then poll) did not fire at all under CDP — the events never reached the handler. Poll `getCurrentTime()/getDuration()` on a plain 1s interval started right after the player is constructed instead; it is a direct call, always truthful, and also survives backgrounded tabs, fullscreen handoff and seeking. (source: lesson player)
- [2026-07-31] Importing anything from `web/src/lib/**` into a Node/tsx script fails if the module chain includes `import "server-only"`. Don't copy the module to work around it — the copy silently drifts from production. Shim it: resolve `server-only` and put an empty module in `require.cache` before requiring the real file. (source: eval_marking)

## Reusable patterns / gotchas

- [2026-07-31] Any eval/aggregation harness must report WHY rows were dropped, with counts. A first run here silently discarded ~50% of responses (zero-mark free-text items have no rubric, so the marker returned null and the whole response was condemned unmarkable) and still printed a confident-looking accuracy figure computed on the skewed remainder. Silent skips look identical to "nothing went wrong". (source: eval_marking)
- [2026-07-31] Google Forms only ever exported a TOTAL per response, never per-question marks. Any accuracy comparison against the 2025/26 gradebook is therefore total-vs-total, and is only fair on homeworks where the engine can mark every graded question unaided — exclude the rest explicitly and name them. (source: eval_marking)
- [2026-07-31] Verify a feature by exercising it, not by reading it. Testing this build surfaced three things inspection had missed: `/lessons/[id]` was linked from two screens but the route did not exist, teachers had no sign-out control anywhere, and `/locked` was redirected to but never created. (source: BSMS v1 gap fill)
