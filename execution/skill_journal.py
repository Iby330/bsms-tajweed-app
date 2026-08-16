#!/usr/bin/env python3
"""
Append-only journal helper for the self-healing skills loop.

Records terse, timestamped notes about what happened during a skill run
(errors, retries/approach-changes, slow steps, gotchas) to an EPHEMERAL
per-skill journal. The reviewer (directives/improve_skill.md) later reads
these and turns recurring/root-caused problems into durable fixes.

The journal is scratch, NOT documentation. Keep entries short.

Usage:
    python execution/skill_journal.py <skill> <event> "<message>"
    python execution/skill_journal.py <skill> <event> "<message>" --duration 42s

    <event> is one of: error | retry | slow | note

    # Has the active journal got entries this session? (exit 0 = yes)
    python execution/skill_journal.py <skill> --has-entries

    # Print the journal path (and nothing else)
    python execution/skill_journal.py <skill> --path

Examples:
    python execution/skill_journal.py casualize-names error "casualize_batch.py crashed on empty company column"
    python execution/skill_journal.py scrape-leads retry "apify actor timed out at 60s; retried with poll interval 10s -> worked"
    python execution/skill_journal.py gmail-label slow "classify step took 90s for 200 emails"

Idempotent: safe to call repeatedly. Creates the research dir tree on first write.
"""

# `str | None` in a signature is evaluated at def time on Python 3.9, which is
# what `python3` still resolves to on macOS — without this the module raises
# TypeError on import and the journal silently stops being written.
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

VALID_EVENTS = ("error", "retry", "slow", "note")

# Resolve project root from THIS file's location (execution/ -> project root),
# so the helper works no matter what the current working directory is.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
RESEARCH_ROOT = PROJECT_ROOT / ".claude" / "skill-research"


def skill_dir(skill: str) -> Path:
    return RESEARCH_ROOT / skill


def journal_path(skill: str) -> Path:
    return skill_dir(skill) / "journal.md"


def has_entries(skill: str) -> bool:
    """True if the active journal exists and contains at least one entry line."""
    jp = journal_path(skill)
    if not jp.exists():
        return False
    for line in jp.read_text(encoding="utf-8").splitlines():
        if line.lstrip().startswith("- ["):
            return True
    return False


def append_entry(skill: str, event: str, message: str, duration: str | None) -> Path:
    jp = journal_path(skill)
    jp.parent.mkdir(parents=True, exist_ok=True)

    now = datetime.now()
    day_header = f"## {now:%Y-%m-%d}"

    existing = jp.read_text(encoding="utf-8") if jp.exists() else ""

    parts = []
    if not existing:
        parts.append(
            f"# Journal — {skill}\n\n"
            "Ephemeral run notes for the self-healing loop. Consumed and archived "
            "by the reviewer (directives/improve_skill.md). Not documentation.\n"
        )
    if day_header not in existing:
        parts.append(f"\n{day_header}\n")

    suffix = f" ({duration})" if duration else ""
    entry = f"- [{now:%H:%M}] {event.upper()}{suffix} — {message}\n"
    parts.append(entry)

    with jp.open("a", encoding="utf-8") as fh:
        fh.write("".join(parts))

    return jp


def main() -> int:
    parser = argparse.ArgumentParser(description="Append a note to a skill's journal.")
    parser.add_argument("skill", help="Skill name, e.g. casualize-names")
    parser.add_argument(
        "event",
        nargs="?",
        help=f"One of: {', '.join(VALID_EVENTS)}",
    )
    parser.add_argument("message", nargs="?", help="Terse description of what happened")
    parser.add_argument("--duration", help="Optional duration tag, e.g. 42s or 2m")
    parser.add_argument(
        "--has-entries",
        action="store_true",
        help="Exit 0 if the active journal has entries, else exit 1",
    )
    parser.add_argument(
        "--path",
        action="store_true",
        help="Print the journal path and exit",
    )
    args = parser.parse_args()

    if args.path:
        print(journal_path(args.skill))
        return 0

    if args.has_entries:
        return 0 if has_entries(args.skill) else 1

    if not args.event or not args.message:
        parser.error("event and message are required when appending an entry")

    if args.event not in VALID_EVENTS:
        parser.error(f"event must be one of {VALID_EVENTS}, got '{args.event}'")

    try:
        path = append_entry(args.skill, args.event, args.message, args.duration)
        print(f"logged -> {path}")
        return 0
    except Exception as e:  # noqa: BLE001 - surface any failure to the caller
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
