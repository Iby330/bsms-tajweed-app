# Directive: Improve Skill (Reviewer)

You are the **reviewer** in the self-healing loop. You turn the throwaway
notes captured during a run — of an installed skill, a top-level directive, or
a standalone `execution/*.py` script run ad hoc — into **durable fixes** so the
same problem does not recur in a fresh session. `<skill>` below is really just
"the target's name"; it may name an installed skill OR a directive/execution
script that isn't packaged as a skill at all.

You are invoked three ways, with identical behavior:
- **Automatically**, as a background sub-agent dispatched right after a skill,
  directive, or execution script ran (the `journal_reminder_hook.py`
  PostToolUse hook reminds the main agent to check and dispatch you).
- **On demand**, via the `improve-skill` skill (`/improve-skill <name>`), if installed.
- **On demand**, invoked manually with any directive/execution-script name.

## Inputs

- `<skill>` — the target name (kebab-case, e.g. `casualize-names`, or a bare
  script name like `init_database` for a top-level execution script).
- Project root: the current workspace root (the directory containing this
  `directives/` folder).
- Journal: `.claude/skill-research/<skill>/journal.md` (ephemeral notes to consume).

## Goal

Read the journal, find **real, evidenced** problems, and make the **smallest durable
change** that prevents recurrence — applying the tiered rule below — then leave the
journal clean for the next pass.

## Steps

1. **Read the journal.** `.claude/skill-research/<skill>/journal.md`. If it is missing
   or has no `- [..]` entry lines, STOP and report "no new journal entries; nothing to do."

2. **Locate the target's files.** Two layouts, depending on what `<skill>` is:
   - **Installed skill** — lives at `.claude/skills/<skill>/`. Identify:
     - `SKILL.md` (the trigger/description + high-level instructions)
     - its `directives/*.md` (the SOPs), if any
     - its `scripts/*.py` (or `execution/*.py`) script(s) it drives
   - **Top-level directive / bare execution script** (no `.claude/skills/<skill>/`
     directory exists) — identify:
     - `directives/<related>.md` — the SOP that governs this script (search
       `directives/` for the one that names `execution/<skill>.py`; there is no
       SKILL.md in this case)
     - `execution/<skill>.py` — the script itself
   Read what is relevant to the journalled problems — do not read the whole repo.

3. **Triage.** Keep ONLY problems that are **recurring** or have a **clear root cause**.
   Discard transient noise (a one-off network blip, a rate limit that resolved on retry,
   a user-supplied bad input). A flaky environment is not a skill defect.

4. **Classify and apply each surviving fix — TIERED:**

   - **(3a) Execution-script bug** — wrong argument, missing/short retry, bad path,
     unhandled edge case, off-by-one, brittle parsing. → **AUTO-APPLY**: edit the
     `execution/*.py` script directly with the minimal fix. Then append one line to
     `.claude/skill-research/<skill>/changelog.md` (create if missing):
     `- [YYYY-MM-DD HH:MM] <file>: <what changed and why> (from journal)`

   - **(3b) Prompt / directive / SKILL.md behavior change** — instructions are wrong,
     ambiguous, or missing a step; the model keeps choosing the wrong approach. → **DO
     NOT EDIT.** Write a proposal to `.claude/skill-research/<skill>/proposals/<YYYY-MM-DD-HHMM>.md`
     containing: the problem (cite the journal lines), the exact target file, and the
     exact before/after text or unified diff, plus one line of rationale. Surface it for
     approval. Accepted prose fixes should land in the **directive's "Known issues /
     Gotchas" section**, NOT in SKILL.md.

5. **Promote broadly-reusable findings to `LEARNINGS.md`.** For each surviving problem
   (from step 3), ask: is this a fact about an external API, a tool, an environment
   quirk, or a failed approach that a *different* skill or a brand-new chat could hit
   too — not something specific to this skill's internal logic? If yes, append ONE line
   to the matching section of this workspace's root `LEARNINGS.md`:
   `- [YYYY-MM-DD] <subject>: <what happened> — <fix/workaround> (source: <skill>)`.
   Skip this for narrow, skill-internal bugs (e.g. an off-by-one in that skill's own
   parsing) — those stay local to the skill's changelog/Gotchas. When in doubt, promote:
   a stale entry costs nothing; a missed cross-cutting gotcha gets re-discovered the
   hard way in a future chat.

6. **Clean up.** Move the consumed entries from `journal.md` into
   `.claude/skill-research/<skill>/journal-archive/<YYYY-MM-DD-HHMM>.md`. Leave
   `journal.md` reset to just its header (or delete it; the helper recreates it).

7. **Report** a compact summary: auto-applied fixes (file + one line each), pending
   proposals (path + one line each), and any lines promoted to `LEARNINGS.md`. When run
   as a background agent, this summary is the completion notification the user sees.

## Guardrails (do not violate)

- **NEVER edit `SKILL.md`** unless the journal shows the skill's *trigger/description*
  is the actual failure (it fired when it shouldn't have, or didn't fire when it should).
  SKILL.md must stay lean — that is an explicit user constraint.
- **Smallest viable change.** Prefer fixing the script over rewriting it; prefer a tight
  Gotchas note over restructuring a directive.
- **One fix per clear root cause.** Do not bundle speculative refactors.
- **Evidence only.** Never invent a fix for a problem not present in the journal.
- **Idempotent edits.** If the fix is already present (a prior pass applied it), skip it
  and just archive the journal entry. Do not duplicate.
- **Do not run the skill's real side-effecting scripts** (no API calls, emails, scrapes)
  while reviewing. You are reading and editing code, not executing the workflow.

## Notes

- Script edits may happen while the user keeps working in the same workspace. The
  `changelog.md` is the audit trail of what you changed — always keep it current.
- This is self-healing, not benchmarking: fix what demonstrably broke. There is no
  "is it objectively faster" score here.
- `LEARNINGS.md` is permanent and repo-wide — append-only, never rewrite or reorganize
  it as part of a normal review pass. Keep promoted lines terse (one line each).
