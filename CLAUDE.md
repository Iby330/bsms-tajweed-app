# Agent Instructions — BSMS Tajweed App

## What this workspace is

A full-stack learning platform for the **BSMS** program: video-based Tajweed instruction
plus Qur'an memorization (hifz) support for students.

Core domains this app deals with:
- **Video lessons** — hosting, ordering into courses/tracks, playback progress
- **Tajweed curriculum** — rules, levels, exercises, assessment
- **Memorization tracking** — student progress by surah/juz/page, revision schedules
- **Students & teachers** — enrollment, cohorts, assignments, feedback

Product and technical decisions (stack, schema, auth, hosting) are recorded in
`directives/` as they get made. Nothing is locked in yet.

---

## The 3-Layer Architecture

You operate within a 3-layer architecture that separates concerns to maximize reliability.
LLMs are probabilistic, whereas most business logic is deterministic and requires consistency.
This system fixes that mismatch.

**Layer 1: Directive (What to do)**
- SOPs written in Markdown, live in `directives/`
- Define the goals, inputs, tools/scripts to use, outputs, and edge cases
- Natural language instructions, like you'd give a mid-level employee

**Layer 2: Orchestration (Decision making)**
- This is you. Your job: intelligent routing
- Read directives, call execution tools in the right order, handle errors, ask for
  clarification, update directives with learnings
- You're the glue between intent and execution

**Layer 3: Execution (Doing the work)**
- Deterministic Python scripts in `execution/`
- Environment variables, API tokens, etc. are stored in `.env`
- Handle API calls, data processing, file operations, database interactions
- Reliable, testable, fast. Use scripts instead of manual work.

### Why this works
If you do everything yourself, errors compound. 90% accuracy per step = 59% success over
5 steps. The solution is to push complexity into deterministic code, so you just focus on
decision-making.

### How this applies to app development here
The app's own source code (frontend, backend, migrations) is normal application code and
lives in its own directories — it is NOT part of `execution/`. `execution/` is for the
*operational* tooling around the app: seeding curriculum data, bulk-importing lesson
videos, generating transcripts, syncing student rosters, running deploys, batch jobs.
If you find yourself doing a repetitive operational task by hand, that's a script.

---

## Operating Principles

**1. Check for tools first**
Before writing a script, check `execution/` per your directive. Only create new scripts if
none exist.

**2. Self-heal when things break**
- Read error message and stack trace
- Fix the script and test it again (unless it uses paid tokens/credits/etc — in which case
  check with the user first)
- Update the directive with what you learned (API limits, timing, edge cases)

**3. Update directives as you learn**
Directives are living documents. When you discover API constraints, better approaches,
common errors, or timing expectations — update the directive. But don't create or
overwrite directives without asking unless explicitly told to. Directives are your
instruction set and must be preserved (and improved over time, not extemporaneously used
and then discarded).

---

## Self-healing loop

Errors are learning opportunities. When something breaks:
1. Fix it
2. Update the tool
3. Test tool, make sure it works
4. Update the directive to include new flow
5. System is now stronger

## Self-healing (journaling + reviewer) — skills, directives, AND execution scripts

The self-healing loop above only helps the *current* chat. A fresh session forgets it.
To make fixes stick across sessions, every run — of an installed **skill**, a top-level
**directive**, or a standalone **execution script** run ad hoc, not just packaged skills —
leaves a trail that a reviewer turns into durable edits. You never edit a SKILL.md to
enable it.

**Enforcement:** a PostToolUse hook (`execution/journal_reminder_hook.py`, wired in
`.claude/settings.json`) fires after any Bash command that runs a script under a
`scripts/` or `execution/` directory and injects a reminder into context — so this
does not depend on remembering. Do not skip the reminder just because a run "looked fine."

**While running ANY skill, directive, or execution script — journal as you go.** When you
hit an error, change approach after something fails ("let me try it another way"), notice
a slow step, or learn a gotcha, append ONE terse note (do not narrate routine success):

```
python execution/skill_journal.py <name> <error|retry|slow|note> "<what happened / workaround that worked>"
# optional: --duration 90s
```

`<name>` is the skill name OR the bare execution-script name (e.g. `seed_curriculum` for
`execution/seed_curriculum.py`) when there's no packaged skill. Notes go to the EPHEMERAL
`.claude/skill-research/<name>/journal.md` — scratch, not docs. Capture what was
attempted, what failed, and the fix that actually worked. Keep it to 1–4 lines.

**When you FINISH the run — reflect.** If the journal has new entries:

```
python execution/skill_journal.py <name> --has-entries   # exit 0 = yes
```

then dispatch the **reviewer** as a BACKGROUND sub-agent (`Agent` tool,
`run_in_background: true`) pointed at `directives/improve_skill.md` for `<name>`, and
carry on — do not block the user. The reviewer auto-applies execution-script fixes and
writes prompt/directive changes as proposals for approval. (On demand, the same thing is
the `improve-skill` skill / `/improve-skill <name>`.)

Constraint: journals and fixes must NEVER bloat SKILL.md — durable fixes land in
`execution/` scripts or a directive's "Gotchas" note.

**Cross-cutting learnings → `LEARNINGS.md`.** The journal above is per-skill and gets
archived away by the reviewer — it doesn't help you before *starting* something new.
`LEARNINGS.md` (project root) is the permanent, cross-cutting counterpart: API
constraints, broken/quirky tools, environment gotchas, and failed approaches that could
bite ANY future task. The reviewer promotes broadly-reusable findings there automatically.
**Check `LEARNINGS.md` before building a new skill, redoing a task that failed before, or
starting work in an unfamiliar domain.**

---

## Multi-agent orchestration patterns

For research/consensus/pipeline tasks needing multiple agents (fan-out/fan-in research +
synthesis, stochastic consensus/debate a.k.a. "model-chat", or a dev→QA sequential
handoff), see `directives/subagent_orchestration_patterns.md` and the `research` /
`synthesizer` / `debate-participant` / `consensus-judge` / `developer` / `qa` /
`code-reviewer` agents in `.claude/agents/`.

## Cloud execution

Serverless endpoints (Modal + Make.com integration) live in
`Agentic Workflow Transition Workspace/modal_app.py`. Standards are in
`directives/modal_cloud_framework.md`.

## Hosting — Netlify deploys from `main` only

The app is hosted on Netlify at **https://bsms-tajweed.netlify.app**
(project `bsms-tajweed`, admin at https://app.netlify.com/projects/bsms-tajweed),
git-linked to `Iby330/bsms-tajweed-app` with continuous deployment.

**Every push to `main` auto-deploys to production, and only `main` does.**
Branch deploys and deploy previews are off. This has a consequence worth
stating plainly:

> **Work on a branch is not live until it reaches `main`.** Pushing a feature
> branch to GitHub deploys nothing. When work on a branch is finished, merge
> it into `main` and push `main` — otherwise it exists on GitHub but no
> student or teacher ever sees it.

The failure mode is quiet, not loud: the branch push succeeds, GitHub shows
the commits, and production silently keeps serving older code. If a change
looks absent from the live site, check `git log origin/main..<branch>` before
suspecting the code.

Conversely, treat a push to `main` as a release: it goes straight to real
users with no gate. Run the build and tests before merging, not after.

### Build configuration
Set on the Netlify site, not in the repo root — the app lives in `web/`:

| Setting | Value |
| --- | --- |
| Base directory | `web` |
| Build command | `npm run build` |
| Publish directory | `.next` (relative to base) |
| Runtime | `@netlify/plugin-nextjs` (SSR — most routes are server-rendered) |
| Config file | `web/netlify.toml`, read from *inside* the base directory |

Env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`) are set on the Netlify site and
must be kept in step with `web/.env.local` by hand — nothing syncs them. A new
env var added locally will build fine here and fail in production.
`SECRETS_SCAN_OMIT_KEYS` exempts the two `NEXT_PUBLIC_*` keys from Netlify's
secrets scanner, which would otherwise fail every build on values Next.js
inlines into the client bundle deliberately.

Deploy gotchas that cost real time are recorded in `LEARNINGS.md` under
"APIs & external services", and in the `netlify-deploy` skill's directive.

## Superpowers Plugin

Superpowers is ON by default. Automatically invoke relevant Superpowers skills
(brainstorming, writing-plans, executing-plans, TDD, debugging, etc.) whenever they apply,
without asking first. If the user says to skip or stop using Superpowers for a task, handle
it normally instead.

---

## Summary

You sit between human intent (directives) and deterministic execution (Python scripts).
Read instructions, make decisions, call tools, handle errors, continuously improve the system.

Be pragmatic. Be reliable. Self-anneal.
