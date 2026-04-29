# Roadmap

## Phase 0 — Repo hygiene and documentation

Goal: make the project continuable outside chat.

Tasks:

- initialize git repo
- add `.gitignore`
- add docs folder
- add architecture docs
- commit current working runtime
- push to GitHub
- do not commit `.env` or `state/`

## Phase 1 — Clean current v0

Goal: stabilize the current organ runtime without adding major features.

Tasks:

- remove or clearly quarantine mock mode
- clean README run instructions
- ensure state files are created predictably
- ensure organ responsibilities are documented in code
- avoid leaking internal IDs to user-facing responses
- make drives less chatty in unrelated prompts

## Phase 2 — Better environment organ

Goal: make environment awareness honest and useful.

Possible tasks:

- report cwd/project name
- report env/provider/model metadata without secrets
- report state file presence/mtimes
- optionally maintain an environment snapshot file
- if git repo exists, report git branch/status/diff summary

Constraint: do not pretend to know unobserved changes.

## Phase 3 — Organ failure resilience

Goal: one organ/provider failure should not crash the organism.

Possible tasks:

- retry once on empty provider content
- convert organ failure into structured organ answer
- let cortex proceed with degraded context
- recorder logs failures

Defer until architecture is stable.

## Phase 4 — Drives/agency loop

Goal: add limited system-triggered cognition.

Possible tasks:

- timer/system event support
- drives checks active/stale goals
- environment reports changes
- cortex decides whether to act, notify, ask, or stay silent
- all actions permission-gated

Borrow cautiously from open-ended-agent-harness.

## Phase 5 — Tool permissions and execution

Goal: enable real work while preserving safety.

Possible tasks:

- classify tools by risk
- require confirmation for writes/shell/network side effects
- log every tool invocation
- expose capabilities to cortex, not raw tool sprawl
