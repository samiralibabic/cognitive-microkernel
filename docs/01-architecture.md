# Architecture

## Mental model

The runtime is an organism-like system.

```txt
main cortex  -> executive reasoning
organs       -> persistent specialist cognition
state stores -> organ tissue
recorder     -> life history
comms        -> sensory/input-output organ
```

The main cortex is not the whole organism. It coordinates organs for one turn, then its working context can be discarded.

## High-level flow

```txt
1. Event arrives.
2. Recorder logs event.
3. Main cortex receives event + organ registry.
4. Main cortex decides which organs to consult and what to ask.
5. Organs reason over their own state/tools.
6. Organs return compact relevant answers.
7. Main cortex combines organ outputs and decides.
8. Communications organ renders/sends user-facing response if needed.
9. Main cortex sends mutation/action commands to organs.
10. Organs decide how to update their own state.
11. Recorder logs organ commands/results.
12. Main cortex context is discarded.
```

## Important design constraint

The cortex should receive selected, compressed, auditable context. It should not receive raw memory stores, raw event logs, full tool registries, or entire file trees.

## Organ activation

A single user/system event can cause multiple LLM calls:

```txt
sensing/context phase:
  cortex -> organ questions -> organ answers

mutation/action phase:
  cortex -> organ commands -> organ state updates
```

This is intentional. A request triggers a chain reaction across relevant organs.

## Current v0 simplification

The runtime is single-process and local. Distributed services, remote agents, autonomous schedulers, and complex vector infrastructure are intentionally deferred.
