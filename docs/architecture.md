# Architecture

## Core model

Cognitive Microkernel separates current-turn reasoning from persistent state.

```txt
cortex  = executive reasoning for the current event
organs  = persistent specialist agents
state   = organ-owned local storage
recorder = append-only audit trail
```

The cortex is intentionally stateless or near-stateless. Continuity lives in organs.

## Runtime loop

```txt
1. Event arrives.
2. Recorder logs the event.
3. Cortex receives the event and organ registry.
4. Cortex asks selected organs targeted questions for consultation round 1.
5. Organs answer from their own state.
6. Cortex either finalizes or asks one targeted follow-up consultation round.
7. If requested, selected organs answer consultation round 2.
8. Cortex finalizes after at most two consultation rounds.
9. Communications organ renders a response if needed.
10. Cortex sends commands back to organs.
11. Organs update their own state.
12. Recorder logs commands and results.
```

The cortex may run up to two consultation rounds before finalizing a response. Round 1 always happens. Round 2 happens only when the cortex needs one more targeted organ answer. Organs never talk to each other; all coordination goes through the cortex.

Model calls use a native OpenAI/OpenRouter-compatible tool-calling harness for structured control decisions. The model may request tool calls, but the runtime validates arguments, executes only tools exposed for that cortex or organ method, returns tool results as `role: "tool"` messages, and stops only when a required final tool returns structured output. Final cortex and organ sense outputs are explicit final tool calls, not free-form JSON text.

When runtime tools and final tools are both available, the harness uses required tool output and `parallel_tool_calls: false`. If one model response contains both non-final tools and `final_*` tools, the runtime executes only the non-final tools, returns a premature-finalization tool warning for the final calls, and does not accept final output until a later model response has observed the tool results.

## Cortex responsibilities

The cortex should:

- interpret the current event
- decide which organs to consult
- ask targeted questions
- combine compact organ answers
- decide what to do next
- communicate through the communications organ
- delegate state updates back to organs

The cortex should not:

- own durable memory
- carry full conversation history
- inspect every tool directly
- manually edit organ state
- claim knowledge that no organ or sensor provided

## Organ contract

Organs expose two modes.

### Sense

The cortex asks for relevant context.

```ts
type OrganQuestion = {
  target: string
  question: string
  event: Event
  constraints?: string[]
}
```

The organ returns a compact answer.

```ts
type OrganAnswer = {
  organ: string
  relevant: boolean
  confidence: number
  summary: string
  evidence?: unknown[]
  recommendedActions?: string[]
  warnings?: string[]
}
```

LLM-backed sense calls return through `final_organ_answer`. The runtime normalizes malformed organ answers by filling the target organ, clamping confidence, preserving array fields, and adding warnings instead of allowing empty or malformed summaries downstream.

### Act

The cortex asks an organ to update its state or perform a bounded operation.

```ts
type OrganCommand = {
  target: string
  operation: string
  payload: unknown
  reason?: string
}
```

The organ decides how to handle the command.

```ts
type OrganResult = {
  target: string
  operation: string
  status: "accepted" | "rejected" | "failed"
  summary: string
  data?: unknown
}
```

## State ownership

Each organ owns its own state. The cortex should not bypass this boundary.

Example:

```txt
episodic       -> recent turns
memory         -> durable facts and decisions
self-model     -> system identity and limits
drives         -> goals and open loops
communications -> response behavior
recorder       -> audit log
```

## Provenance rule

The system should be able to explain how it knows a nontrivial fact.

Common sources:

- current event
- episodic organ
- durable memory
- self-model
- drives/goals
- environment state
- user-provided input
- model inference

If no source exists, the system should say it does not know.
