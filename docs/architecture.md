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
4. Cortex asks selected organs targeted questions.
5. Organs answer from their own state.
6. Cortex reasons over compact organ answers.
7. Communications organ renders a response if needed.
8. Cortex sends commands back to organs.
9. Organs update their own state.
10. Recorder logs commands and results.
```

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
