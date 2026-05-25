# Roadmap

The roadmap is intentionally narrow. Keep the architecture clean before adding autonomy.

## Phase 1 — Clean baseline

Goal: make the current prototype easy to understand and safe to continue.

Included:

- concise docs
- accurate README
- `.env` and `state/` ignored
- no internal IDs in normal replies
- clearer “how do you know?” provenance behavior
- no overclaiming capabilities
- bounded consultation rounds
- native tool-calling control outputs
- model tool trace for verbose debugging

Excluded:

- new file tools
- autonomous loop
- write actions
- shell execution

Done when:

- a new reader can understand the repo in under 10 minutes
- current behavior matches the docs
- local state/secrets are not committed

## Phase 1b — Native tool-calling control plane

Status: done/current.

Goal: make structured model control flow explicit, traceable, and fail-closed.

Included:

- final tools for cortex planning, cortex finalization, organ answers, and communications rendering
- required tool output for structured calls with multiple allowed tools
- `parallel_tool_calls: false` in the harness
- observation-before-finalization when runtime tools and final tools appear together
- protocol-error traces for stop-without-tool and malformed final output

Done when:

- `bun run test:harness` passes
- verbose mode shows model tool trace entries for model calls, tool calls, tool results, and protocol errors

## Phase 2 — Read-only project awareness

Goal: let the system inspect its own project safely.

Included:

- list files in current project directory
- read selected allowed files
- inspect package/config/docs
- summarize current repo structure
- log every read

Excluded:

- `.env`
- secrets
- arbitrary home-directory access
- writes
- shell execution

Done when:

- the system can answer “read your own code and tell me what you think”
- it can explain exactly what it read
- it cannot read blocked files

## Phase 3 — Organ failure resilience

Goal: one failing organ should not crash the organism.

Included:

- retry once on empty provider response
- convert organ failure into structured answer
- continue with degraded context where safe
- log provider anomalies

Done when:

- a provider empty-content error becomes a logged organ failure, not a process crash

## Phase 4 — Better drives and limited agency

Goal: support system-triggered cognition without uncontrolled autonomy.

Included:

- timer/system events
- drives checks active or stale goals
- environment reports relevant changes
- cortex decides whether to act, ask, notify, or stay silent

Excluded initially:

- unsupervised writes
- shell commands
- network side effects

Done when:

- the system can react to a scheduled local event and decide whether user communication is needed

## Phase 5 — Permissioned tools

Goal: add useful actions with explicit boundaries.

Likely sequence:

```txt
read-only project tools
-> explicit file write tools
-> shell tools
-> network/API tools
```

Every side effect needs:

- permission model
- recorder log
- clear user-facing explanation when relevant
