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

<!-- - [YYYY-MM-DD] <service>: <constraint/gotcha> — <what to do instead> (source: <skill/directive>) -->

## Tools & environment

<!-- - [YYYY-MM-DD] <tool>: <what broke> — <workaround> (source: <skill/directive>) -->

## Failed approaches (don't retry these)

<!-- - [YYYY-MM-DD] <task>: tried <approach>, failed because <reason> — do <alternative> instead (source: <skill/directive>) -->

## Reusable patterns / gotchas

<!-- - [YYYY-MM-DD] <pattern>: <what to watch for> (source: <skill/directive>) -->
