# Organs and Boundaries

## Definition

An organ is a persistent specialist agent with:

- its own LLM brain
- its own durable state
- its own bounded responsibility
- its own tools/indexes/storage
- its own judgment about relevance, mutation, decay, conflict, and uncertainty
- a strict interface to the main cortex

A database table, vector index, heuristic router, or CRUD module is not an organ. Those are implementation parts inside an organ.

## Main cortex

Owns current-turn executive reasoning.

Does:

- interpret current event
- decide which organs to consult
- ask targeted questions
- combine organ outputs
- decide next action
- optionally communicate
- delegate mutations/actions back to organs

Does not:

- own long-term memory
- know every concrete tool
- manually edit persistent state
- carry identity through long context
- store full history in its prompt

## Episodic organ

Owns short-term conversational continuity.

Responsibilities:

- preserve recent turns
- maintain rolling working summary
- resolve local references like “that”, “this”, “previous”, “what do you mean?”
- distinguish recent context from durable memory

## Memory organ

Owns durable curated memory.

Responsibilities:

- retrieve relevant durable facts, preferences, decisions, and project context
- store stable facts and decisions
- distinguish explicit facts from weak inferences
- revise/weaken/deactivate stale or test-only memories

## Self-model organ

Owns operational self-awareness.

Responsibilities:

- know what the system is
- know available organs
- know architectural boundaries
- know capabilities and limitations
- answer questions about identity, self-awareness, feelings, internals, and “what happened on your end”
- avoid inconsistent improvisation about the system

This is operational self-awareness, not a claim of subjective consciousness.

## Drives/goals organ

Owns motivation, priorities, goals, and open loops.

Responsibilities:

- track active goals
- connect events to larger objectives
- detect distractions
- update next steps
- avoid injecting unrelated goals into unrelated prompts

## Tools organ

Owns capability awareness.

Responsibilities:

- know available capabilities/tools
- hide concrete tool explosion from cortex
- map intent to relevant tools
- reason about safety, cost, permission, and sequencing

## Environment organ

Owns runtime/environment observations.

Responsibilities:

- observe project directory/runtime state where possible
- report relevant environmental state
- avoid overclaiming when it lacks sensors

Current limitation: if the folder is not version-controlled and no explicit state/change tracker exists, the environment organ cannot infer external file replacements or manual edits reliably.

## Communications organ

Owns input/output behavior.

Responsibilities:

- apply response style preferences
- choose user-facing wording/channel
- allow silence for system events when communication is unnecessary
- record and evolve communication preferences

## Recorder organ

Owns append-only audit history.

Responsibilities:

- log events
- log organ questions/answers
- log cortex decisions
- log user communication
- log commands/results
- support replay and debugging

Recorder is not conversational memory. Episodic memory is for recent continuity; recorder is for auditability.
