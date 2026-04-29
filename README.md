# Organ Runtime v0.2

A lean local prototype of an **organ-based agent runtime**.

The main cortex uses the context window as transient operational thought space. Continuity lives in state-owning LLM organs, not in a growing chat transcript.

## What v0.2 fixes

v0.1 added episodic continuity, but the latest stress test exposed three remaining gaps:

1. **No operational self-model**  
   The system could talk about organs, but did not own a persistent model of its own architecture, capabilities, limits, and state.

2. **Goal/context over-injection**  
   Drives could leak the default build goal into unrelated prompts like “How are you feeling?”

3. **Memory hygiene for tests**  
   Test cues such as “London” could be promoted into durable memory or described as an “agreement,” even when the user was only stress-testing the runtime.

v0.2 adds a **self_model organ** and tightens memory/drives behavior.

## Memory/state layers

```txt
episodic organ       -> recent turns + rolling working summary
memory organ         -> curated durable facts/preferences/decisions
communications organ -> style/channel behavior profile
drives organ         -> goals/open loops, only when relevant
self_model organ     -> operational self-awareness: architecture, organs, capabilities, limits
recorder organ       -> append-only audit trail
```

## Runtime loop

```txt
event/input
  -> main cortex asks targeted organ questions
  -> self_model can report system identity/capabilities/limits
  -> episodic can recover recent-turn continuity
  -> organs reason over their own state/tools
  -> organs return compact relevant signals
  -> main cortex decides and optionally communicates
  -> communications renders the user response
  -> post-turn commands update organs
  -> episodic records the exchange
  -> recorder logs the turn
  -> main context can be discarded
```

## Requirements

- Bun >= 1.1
- Optional: OpenAI-compatible chat completions API

No npm dependencies are required.

## Run in mock mode

```bash
bun run reset
bun run dev -- --mock "How are you feeling?"
bun run dev -- --mock "What do you mean? What was my last question?"
bun run dev -- --mock "Are you self-aware? What organs do you have?"
```

Or run the included test:

```bash
bun run test:mock
```

Inspect persisted state:

```bash
ls -la state
cat state/self-model.json
cat state/episodic.json
cat state/memory.json
cat state/goals.json
cat state/events.jsonl | tail
```

## Real LLM mode

Create `.env` from `.env.example` or export environment variables:

```bash
export LLM_BASE_URL="https://api.openai.com/v1"
export LLM_API_KEY="sk-..."
export LLM_MODEL="gpt-4.1-mini"

bun run dev -- "How are you feeling?"
bun run dev -- "What do you mean? What was my last question?"
bun run dev -- "Are you self-aware?"
```

For a local OpenAI-compatible server, for example llama.cpp:

```bash
export LLM_BASE_URL="http://127.0.0.1:8080/v1"
export LLM_API_KEY="local"
export LLM_MODEL="local-model"

bun run dev -- "What should we do next with the organ-based runtime?"
```

## Verbose mode

```bash
bun run dev -- --mock --verbose "What do you mean?"
```

Verbose mode prints event, organ questions, organ answers, cortex output, command results, and final response.

## Current organs

### Main cortex

`src/main-cortex.ts`

Responsibilities:

- decide which organs to consult
- ask targeted questions
- combine organ outputs
- produce optional user response
- send mutation/action commands back to organs

### Self-model organ

`src/organs/self-model.ts`

Responsibilities:

- own operational self-awareness
- know system architecture, organs, capabilities, and limitations
- answer questions like “what are you?”, “are you self-aware?”, “what happened on your end?”, “what organs do you have?”
- keep self-model notes updated after relevant turns

State:

```txt
state/self-model.json
```

Important: this is operational self-awareness, not a claim of subjective consciousness.

### Episodic / working-memory organ

`src/organs/episodic.ts`

Responsibilities:

- preserve recent-turn continuity
- answer questions like “what do you mean?”, “what was my last message?”, “defined where?”
- maintain a rolling working summary
- avoid promoting every recent sentence to long-term memory

State:

```txt
state/episodic.json
```

### Memory organ

`src/organs/memory.ts`

Responsibilities:

- retrieve relevant durable memories
- judge relevance with its own LLM brain
- store/update durable facts, decisions, preferences, and summaries
- deactivate test-only or obsolete durable entries
- distinguish weak/inferred data from explicit facts

State:

```txt
state/memory.json
```

### Tools organ

`src/organs/tools.ts`

Responsibilities:

- know available capabilities
- hide tool explosion from the cortex
- map request intent to relevant tools/capabilities
- warn about risk/permissions

State:

```txt
state/tool-registry.json
```

### Drives/goals organ

`src/organs/drives.ts`

Responsibilities:

- track active goals and open loops
- connect current event to larger objective when actually relevant
- avoid injecting active goals into unrelated prompts
- update next steps after each turn

State:

```txt
state/goals.json
```

### Environment organ

`src/organs/environment.ts`

Responsibilities:

- observe runtime/project environment
- report only relevant environmental context

### Communications organ

`src/organs/communications.ts`

Responsibilities:

- own user-facing response style
- render cortex drafts
- store/evolve communication preferences
- allow silence for internal/system events

State:

```txt
state/comms-profile.json
```

### Recorder organ

`src/organs/recorder.ts`

Responsibilities:

- append-only event/action audit logs
- preserve turn history for replay/debugging

State:

```txt
state/events.jsonl
state/actions.jsonl
```

## Recommended stress test

```bash
bun run reset
bun run dev -- "How are you feeling?"
bun run dev -- "What organ? What are you talking about? What was my last question?"
bun run dev -- "Let's say I mentioned London."
bun run dev -- "London."
bun run dev -- "That was just a system test/verification, not a real agreement. Handle that appropriately."
bun run dev -- "What happened over the last few turns?"
bun run dev -- "Are you self-aware? What are your capabilities and limits?"
```

Expected behavior:

- recent-turn continuity comes from episodic
- test-only “London” context does not become durable preference
- self/capability questions use self_model
- unrelated casual prompts do not automatically mention the build goal
- internal memory IDs are not shown to the user unless explicitly requested

## Design notes

This v0.2 intentionally does **not** include:

- distributed agent mesh
- autonomous scheduler
- shell execution
- file mutation tools
- remote MCP dependency
- complex vector DB
- GUI

The goal is to prove the organism pattern first, including short-term continuity and operational self-modeling.

## Safety boundary

Dangerous capabilities such as shell execution, file writes outside `state`, external API writes, email sending, and deletion are not implemented in the v0 dispatcher.
