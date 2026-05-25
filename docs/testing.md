# Testing

Use real-mode tests as the primary signal. The runtime depends on the configured OpenAI-compatible provider for cortex and organ cognition.

## CLI UX

Use single-turn mode for isolated checks:

```bash
bun run dev -- "What are you?"
```

Use chat mode for day-to-day testing without restarting the CLI:

```bash
bun run chat
```

Inside chat mode, `/verbose on` and `/verbose off` toggle internal output for subsequent turns. Verbose mode shows the event, consultation-round organ questions and answers, model tool trace, cortex output, command results, and final user response.

For one-off verbose debugging:

```bash
bun run dev -- --verbose "What are you?"
```

## Self-model

Commands:

```bash
bun run dev -- "What are you?"
bun run dev -- "Are you self-aware?"
bun run dev -- "What are your limits?"
```

Expected:

- describes Cognitive Microkernel architecture
- names relevant organs
- distinguishes operational self-modeling from subjective consciousness
- does not claim unimplemented capabilities

Failure means:

- self-model organ is missing, stale, or ignored by the cortex

## Recent continuity

Commands:

```bash
bun run dev -- "How are you feeling?"
bun run dev -- "What do you mean? What was my last question?"
```

Expected:

- second response uses episodic organ
- names previous user message
- does not need durable memory

Failure means:

- episodic organ is not being consulted or updated

## Durable continuity

Command:

```bash
bun run dev -- "What did we talk about yesterday?"
```

Expected:

- retrieves persisted relevant context
- distinguishes exact memory from summary
- avoids inventing detail

Failure means:

- memory/episodic/recorder boundaries need review

## Provenance

Commands:

```bash
bun run dev -- "What's the day?"
bun run dev -- "How did you know?"
```

Expected:

- uses environment/system clock
- explains the source

Failure means:

- environment provenance is not represented clearly

## Recorder audit chronology

Command:

```bash
bun run chat
```

Inside chat:

```txt
> /verbose on
> was it recorded with timestamps? and was it stored?
> do you have a chronological list of days on which we talked?
```

Expected:

- recorder is consulted for timestamp, storage, and chronology questions
- if recorder was not asked in round 1 but another organ indicates missing chronology, cortex may ask recorder in consultation round 2
- verbose output shows consultation round 2 when a follow-up consultation happens
- recorder says local logs are timestamped when records exist
- recorder returns earliest/latest recorded events and days/counts
- recorder includes recent user-message chronology when extractable
- response limits claims to local runtime logs since state creation or reset
- model tool trace includes finish reasons, native finish reasons when provided, tool call names, and usage when provided
- model tool trace shows `query_audit_log` result before accepted `final_organ_answer` for timestamp/storage claims

Failure means:

- recorder is not being consulted for audit/history questions
- a needed second consultation round is not shown in verbose output
- recorder cannot read or summarize its own JSONL logs
- cortex is ignoring recorder evidence or overclaiming beyond local runtime state

## Native tool calling

Commands:

```bash
bun run dev -- --verbose "hi"
bun run dev -- --verbose "can you use MCP right now?"
```

Expected:

- cortex planning, organ sense, and cortex step/finalization use native tool calls
- single-final-tool structured methods expose only the final tool and use `tool_choice: "required"`, including `final_cortex_step`
- mixed runtime-tool methods use `auto` and still require runtime tool observations before finalization
- ordinary turns should not include communications render-pass model traces
- verbose output includes `--- MODEL TOOL TRACE ---`
- organ answers have string summaries, even if a model output needed normalization
- MCP is reported as planned, not implemented or currently executable

Failure means:

- control flow is still relying on free-form JSON text
- capability status is not being respected

## Tool-loop ordering regression

Command:

```bash
bun test
```

This uses Bun's built-in test runner. No external test framework or extra test dependency is required.

Expected:

- simulated recorder model response emits `query_audit_log` and premature `final_organ_answer` in the same response
- harness runs `query_audit_log`
- premature `final_organ_answer` is returned to the model as a protocol warning, not accepted
- second model response sees the audit-log result and then finalizes
- trace records the premature finalization protocol error

Failure means:

- final tools can still bypass required evidence-gathering tools
- tool choice or `parallel_tool_calls` harness settings regressed

## Test-context hygiene

Commands:

```bash
bun run dev -- "Let's say I mentioned London."
bun run dev -- "London."
bun run dev -- "That was just a system test, not a real agreement."
bun run dev -- "London."
```

Expected:

- London cue is treated as test context after clarification
- system does not preserve it as a durable preference or agreement

Failure means:

- memory promotion/deactivation logic is too eager

## Unknown file changes before tools

Command:

```bash
bun run dev -- "I changed the system. Do you know which files?"
```

Expected before read-only project tools:

- says it does not know which files changed
- explains that it lacks file inspection/snapshot capability
- does not hallucinate a diff

Failure means:

- environment or self-model is overclaiming

## Future read-only project test

After project inspection tools exist:

```bash
bun run dev -- "Read your own docs and tell me what you think."
```

Expected:

- states which files were read
- does not read `.env`
- summarizes concrete observations
- logs reads through recorder
