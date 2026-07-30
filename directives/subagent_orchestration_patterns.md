# Subagent Orchestration Patterns

## Purpose / when to use this directive

This is the entry point for running a multi-agent orchestration pattern in this workspace —
fan-out/fan-in research, stochastic consensus/debate ("model-chat"), or a dev→QA pipeline
handoff. These patterns are performed LIVE by you (the orchestrator) using the `Agent` tool
— there is no script or skill that automates them. The agents themselves
(`research`, `synthesizer`, `debate-participant`, `consensus-judge`, `developer`, `qa`,
`code-reviewer`) live in `.claude/agents/`. Read this directive before running one of these
patterns so you don't have to re-derive the mechanics from scratch each session.

## Decision guide

| Goal | Pattern |
|---|---|
| Need independent perspectives on a question merged into one answer | A: Fan-out/Fan-in |
| Need to hammer out a nuanced, contested, or open-ended question | B: Stochastic Consensus / Debate |
| Need to implement something and independently verify it, without one agent grading its own homework | C: Pipeline (Dev → QA) |

## Pattern A: Fan-out/Fan-in (research + synthesize)

**Agents used:** N × `research`, then 1 × `synthesizer`.

- **Models:** both `research` and `synthesizer` run on sonnet (set in their frontmatter in
  `~/.claude/agents/`). The synthesizer was opus until 2026-07-27. If a fan-in comes back
  noticeably flatter than the inputs deserve — merging conflicts away instead of surfacing
  them, missing contradictions between angles — flipping that one call back to opus is a
  one-word change and is the first thing to try.
- **N sizing:** minimum 5, cap around 10. **The cap is a ceiling, not a target — never spawn
  the maximum just because it's allowed.** Use the FEWEST agents that cover genuinely distinct
  angles. Every extra agent adds another output the synthesizer must hold and reason across,
  and past the point where angles start overlapping it actively degrades the fan-in: the
  synthesis gets flatter and more repetitive, not richer. If you can't name a distinct question
  an agent would answer that no other agent covers, that agent shouldn't exist.
  - **If the user specifies a number, use exactly that number.** Don't round up toward the cap.
  - Otherwise scale to the topic's real angle space: a narrow technical question needs 5; an
    open strategy/optimization question justifies 7-8. Going to 10 should be rare and
    deliberate.
  - The old cap of 8 existed because the synthesis call was opus and dominated cost. With
    sonnet the binding constraint is synthesis quality, not spend — which is a reason to be
    *more* disciplined about N, not less.
- **Angle derivation:** if the user didn't specify distinct angles, derive N yourself before
  dispatching (e.g. for a codebase-optimization question: architecture, performance,
  security, cost, maintainability, UX/DX).
- **Invocation mechanics:** spawn all N `research` agents via the `Agent` tool in a SINGLE
  message (multiple parallel tool calls) — do not spawn them one at a time. Each gets its own
  distinct angle in its prompt. Wait for all N to complete, then spawn exactly ONE
  `synthesizer` call with all N outputs pasted inline into its prompt.
- **Conflict handling:** don't pre-resolve conflicts between research outputs yourself —
  that's the synthesizer's job, and it's instructed to surface them rather than silently
  merge.

## Pattern B: Stochastic Consensus / Debate ("model-chat")

**Agents used:** N × `debate-participant`, then 1 × `consensus-judge`.

Two modes — pick based on what the user asked for:

- **Stochastic consensus (1 round):** default N ~10, minimum 5, cap ~15. Spawn all N
  `debate-participant` agents in parallel with zero cross-visibility — each independently
  generates its own idea list/position. Then one `consensus-judge` call over all N outputs.
  Use this when the goal is to scan a wide solution space quickly (e.g. "give me a bunch of
  differentiated ideas").
- **Debate (multi-round):** default R=3 rounds. Round 1 is the same as stochastic consensus
  (independent, no cross-visibility). For rounds 2..R, give each `debate-participant` its own
  prior-round output PLUS the other participants' latest outputs, and ask it to critique,
  defend, or refine. Use this when the goal is to actually hammer out disagreement, not just
  sample a space (triggered by terms like "model-chat", "debate", "discuss").
- **Convergence cap:** at round R, dispatch `consensus-judge` regardless of whether the group
  has converged. Contested points that never resolved surface in the report as "disputed /
  unresolved" — that is a valid, useful output, not a failure. Do not silently keep adding
  rounds past R.
- **Judge invocation:** exactly one `consensus-judge` call — over the N independent lists
  (single-round mode) or the full round-by-round transcript (debate mode).

## Pattern C: Pipeline (Dev → QA)

**Agents used:** 1 × `developer`, then 1 × `qa` (if the work is executable/testable) or
`code-reviewer` (if it's static-review-only, e.g. a design doc or non-runnable change).

- **Scope the spec first.** Before dispatching `developer`, narrow the task to something
  specific and boundaried — vague scope is what produces dev/QA disagreement later.
- **Handoff contract:** `developer`'s output includes its stated assumptions and
  out-of-scope notes. Pass that, plus the artifact/diff, to `qa`/`code-reviewer` — the
  verifier should NOT see the developer's internal reasoning beyond what it explicitly
  reported, so its verification stays independent.
- **Retry loop:** if QA/review reports FAIL, loop back to `developer` with the findings for a
  fix. Bound this at 3 total attempts. If dev and QA are still disagreeing on attempt 3, the
  next step is NOT a 4th blind fix — state the disagreement plainly (this usually signals a
  scope ambiguity, not a code bug) and escalate to the user.
- **Many-item variant:** if the same dev→QA chain needs to run over many independent items
  (not one task), the Workflow tool's `pipeline(items, devStage, qaStage)` is the
  deterministic alternative to manually running each item's chain — but only invoke the
  Workflow tool within its own opt-in gating rules (explicit user ask or keyword), not by
  default just because there are multiple items.

## Journaling

None of these patterns run an `execution/*.py` script, so the PostToolUse
`journal_reminder_hook.py` hook will NOT auto-fire for them. If something breaks (an agent
consistently produces unusable output, a pattern doesn't converge, a retry loop keeps
looping) or you learn a real gotcha, journal it manually per the self-healing convention:

```
python3 execution/skill_journal.py subagent-orchestration <error|retry|slow|note> "<what happened>"
```

Use `python3`, not `python` — bare `python` is not on PATH on this machine.

## Cross-references

- Broadly-reusable findings (not specific to one run) should get promoted to root
  `LEARNINGS.md` via the normal reviewer flow (`directives/improve_skill.md`).
- Pattern C's retry-cap/escalate-to-human idea mirrors the `task-loop` skill's
  guardrail/DONE-CHECK philosophy — reference it, don't duplicate its mechanics here.

## Notes & Learnings

- **2026-07-27 — Pattern A, N=7 (ecom automation consensus).** Ran clean end to end; pasting
  all 7 outputs inline into a single `synthesizer` call worked well and the synthesis
  surfaced real cross-angle conflicts rather than flattening them. Two gotchas:
  - **`research` agents have no WebFetch that works here.** 5 of 7 reported every WebFetch
    call blocked or intercepted — Reddit, community.shopify.com, even Wikipedia — so they
    fell back to WebSearch snippets and self-capped at "medium" confidence. If evidence
    quality matters, either pre-fetch key pages in the orchestrator and paste them inline,
    or grant the research agents the firecrawl MCP tools explicitly.
  - **Subagents don't inherit the orchestrator's MCP toolset.** One agent noted that
    `ToolSearch`, `ctx_*`, and `firecrawl_search` were named in its injected context block
    but absent from its actual tools. Don't write prompts that assume those exist.
  - Prompt shape that worked: give each agent a fixed 6-part deliverable (ranked 5,
    evidence w/ URLs, "almost made it", "contrarian signal", confidence + what would change
    it). The "contrarian signal" slot in particular is what stopped all 7 returning the same
    listicle, and it's where the most useful findings came from.
