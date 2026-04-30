# Cognitive Microkernel

Cognitive Microkernel is a local prototype for an LLM runtime with a stateless main cortex and persistent specialist organs.

The core idea: the context window is working space, not memory. Each CLI run can start fresh, ask organs for relevant state, reason over their answers, respond if needed, then send update commands back to organs.

```txt
event
  -> cortex asks organs
  -> organs return compact context
  -> cortex decides
  -> response is sent if needed
  -> organs update their own state
  -> recorder logs the turn
```

## What works now

The current prototype demonstrates:

- recent-turn continuity through the episodic organ
- persistent local state across CLI runs
- durable memory hooks
- operational self-modeling
- basic drives/goals state
- communications profile
- append-only recorder
- current date/time awareness through environment state

## What does not work yet

The prototype does not yet provide:

- arbitrary file access
- codebase inspection
- write actions
- shell execution
- autonomous drive loop
- robust organ failure recovery
- mature permission model

Those are planned capabilities, not current guarantees.

## Run

```bash
bun install
cp .env.example .env
bun run dev -- "What do you know about yourself?"
```

The provider must expose an OpenAI-compatible chat API.

## Reset local state

```bash
bun run reset
```

## Local state and secrets

Do not commit:

```txt
.env
state/
node_modules/
```

## Documentation

Read in this order:

```txt
docs/architecture.md
docs/organs.md
docs/decisions.md
docs/roadmap.md
docs/testing.md
```
