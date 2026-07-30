#!/usr/bin/env python3
"""
PostToolUse (Bash) hook for the self-healing loop.

Fires after ANY bash command that ran a Python script under a `scripts/` or
`execution/` directory -- whether that's an installed skill's script
(.claude/skills/<name>/scripts/*.py) or a top-level directive/execution
script (execution/*.py) run directly. Injects a reminder into context to
journal notable events and check whether the improve_skill reviewer should
be dispatched.

Silent (no output, exit 0) when the command didn't touch such a script --
hooks that print nothing add nothing to context.
"""

import json
import re
import sys

# Infra scripts that ARE the self-healing loop itself -- never journal-worthy
# in their own right, and matching them would cause a self-referential loop.
EXCLUDED_SCRIPTS = {"skill_journal", "journal_reminder_hook"}


def resolve_name(command: str) -> str | None:
    skill_match = re.search(r"\.claude/skills/([^/\s]+)/", command)
    if skill_match:
        return skill_match.group(1)

    exec_match = re.search(r"(?:^|[\s/])(?:execution|scripts)/([A-Za-z0-9_.-]+?)\.py", command)
    if exec_match and exec_match.group(1) not in EXCLUDED_SCRIPTS:
        return exec_match.group(1)

    return None


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    command = (payload.get("tool_input") or {}).get("command") or ""
    name = resolve_name(command)
    if not name:
        return 0

    context = (
        f"[self-healing reminder] You just ran a script tied to '{name}' "
        f"(skill, directive, or ad-hoc execution script). If anything "
        f"notable happened just now (error, retry/approach-change, slow "
        f"step, or gotcha), journal it now: "
        f"python execution/skill_journal.py {name} <error|retry|slow|note> "
        f"\"<message>\". When the overall task/workflow for '{name}' is fully "
        f"done, run `python execution/skill_journal.py {name} --has-entries` "
        f"and, if it exits 0, dispatch a background reviewer agent against "
        f"directives/improve_skill.md for '{name}' before moving on."
    )

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": context,
        }
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
