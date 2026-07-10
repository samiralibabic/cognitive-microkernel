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

- final tools for cortex planning, cortex step/finalization, and organ answers
- final user-facing responses emitted directly from cortex output without communications rendering
- runtime tool output observation for structured calls with real runtime tools
- `parallel_tool_calls: false` in the harness
- observation-before-finalization when runtime tools and final tools appear together
- protocol-error traces for stop-without-tool and malformed final output

Done when:

- `bun test` passes
- verbose mode shows model tool trace entries for model calls, tool calls, tool results, and protocol errors

Future option:

- funnel all outbound communication through Communications with a strict pass-through contract: preserve cortex intent and claims, adapt only delivery/style/transport, and cover it with tests before reintroducing the extra processing step

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

## Long-term direction — Bounded cognitive loops

The current cortex already supports at most two consultation rounds. Further internal iteration should be introduced in stages rather than as an unbounded loop.

### Stage A — Bounded organ-local loops

An organ may perform several internal model/tool steps before returning one `OrganAnswer` to the cortex.

Boundaries:

- the organ may access only its own state and tools exposed to that organ method
- organs never communicate directly with other organs
- cross-organ coordination remains cortex-owned
- each organ loop starts with a small fixed step budget
- internal steps and tool results are recorded and visible in verbose/model-tool traces
- the organ must return a final normalized answer or a structured protocol failure when the budget is exhausted

This stage allows an organ to complete multi-step work without requiring the cortex to micromanage every operation.

### Stage B — Persistent cortex event loop

The later endgame is a cortex that processes an event queue, consults organs, acts or stays silent, updates organs, and waits for the next event.

This is deferred until the runtime has mature:

- permission boundaries
- organ and provider failure handling
- drives and goal hygiene
- communication and silence behavior
- recorder coverage and auditability
- bounded-loop tests and regression coverage

The persistent cortex loop must also use explicit step budgets and must not create direct organ-to-organ communication.
