# Cognitive Microkernel

Cognitive Microkernel is a local prototype for an LLM runtime with a stateless main cortex and persistent specialist organs.

The core idea: the context window is working space, not memory. Each CLI run can start fresh, ask organs for relevant state, reason over their answers, respond if needed, then send update commands back to organs.

```txt
event
  -> recorder logs event
  -> cortex plans consultation round 1 via final_organ_questions
  -> selected organs answer via final_organ_answer
  -> cortex finalizes or requests one targeted round 2
  -> cortex steps/finalizes via final_cortex_step
  -> runtime emits cortex userResponse directly
  -> organ commands execute
  -> recorder logs commands, model traces, and completion
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
- bounded two-round cortex consultation
- native OpenAI/OpenRouter-style tool calls for structured control outputs
- verbose model tool trace with finish reasons and tool results

## How model calls work now

The runtime uses native tool calls for cortex planning, cortex step/finalization, and organ sense answers. The final user-facing response is emitted directly from the cortex output to avoid an extra model-call failure point. Structured control data comes from explicit final tools such as `final_organ_questions`, `final_cortex_step`, and `final_organ_answer`.

When a structured method exposes exactly one final tool and no runtime tools, the harness forces that named function. When a method exposes real runtime tools plus a final tool, the harness uses `auto`, disables parallel tool calls, executes non-final tools first, and only accepts a final tool after required tool results have been returned to the model. Plain-text `stop` responses are treated as protocol errors for these structured calls.

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

For an interactive local session:

```bash
bun run chat
```

For one-off debugging, verbose mode shows the event, consultation rounds, organ questions and answers, model tool trace, cortex output, command results, and final user response:

```bash
bun run dev -- --verbose "What are you?"
```

The provider must expose an OpenAI-compatible chat API. For OpenRouter debugging, provider pinning can be configured with `LLM_PROVIDER_ONLY`, `LLM_PROVIDER_ALLOW_FALLBACKS`, and `LLM_PROVIDER_REQUIRE_PARAMETERS`.

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
