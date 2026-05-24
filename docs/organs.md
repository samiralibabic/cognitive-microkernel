# Organs

An organ is a specialist LLM-backed subsystem with bounded responsibility and owned state.

A database, vector index, helper function, or JSON file is not an organ. Those are implementation details inside an organ.

## Episodic organ

Purpose: short-term conversational continuity.

Owns:

- recent user messages
- recent assistant responses
- rolling working summary

Answers:

- “What was my last message?”
- “What happened over the last few turns?”
- “What do you mean?”
- references like “that”, “this”, “previous”

Updates:

- stores completed turns
- updates rolling summary

Should not:

- promote every sentence to durable memory
- make long-term preference decisions

Status: implemented.

## Memory organ

Purpose: durable curated memory.

Owns:

- stable user facts
- explicit preferences
- durable decisions
- project context
- long-lived constraints

Answers:

- “What did we decide about this?”
- “Do you remember my preference?”
- “What do we know about this project?”

Updates:

- stores durable facts and decisions
- revises stale memories
- deactivates test-only or contradicted memories

Should not:

- store every recent utterance
- treat jokes or stress tests as permanent preferences without evidence
- expose internal memory IDs in normal replies

Status: implemented in basic form.

## Self-model organ

Purpose: operational self-awareness.

Owns:

- system identity
- architecture summary
- organ list
- capability boundaries
- known limitations

Answers:

- “What are you?”
- “Are you self-aware?”
- “What organs do you have?”
- “Can you read files?”
- “How did you know that?”

Updates:

- records architecture-level changes
- records capability changes
- records clarified limitations

Should not:

- claim subjective feelings
- claim file/tool access that is not implemented
- improvise inconsistent system identity

Status: implemented in basic form.

## Drives organ

Purpose: goals, priorities, and open loops.

Owns:

- active goals
- next steps
- unresolved loops
- priority signals

Answers:

- “What are we trying to do?”
- “What is the next step?”
- “Does this belong to an active goal?”

Updates:

- creates or updates goals
- closes completed loops
- marks stale or blocked items

Should not:

- inject unrelated goals into ordinary prompts
- turn every user message into a project task

Status: implemented in basic form.

## Tools organ

Purpose: capability awareness.

Owns:

- available tool/capability registry
- permission metadata
- intended usage patterns
- risk notes

Answers:

- “What can you do here?”
- “Which tool would fit this request?”
- “Can you inspect files?”
- “What guardrails apply?”

Updates:

- records new capabilities
- records changed permissions
- records broken or unavailable tools

Should not:

- expose a giant raw tool list to the cortex
- claim a capability only because it is planned
- execute side effects without permission boundaries

Status: scaffolded/basic. Real file/code tools are not implemented yet.

## Environment organ

Purpose: observable runtime state.

Owns:

- current date/time
- known runtime environment
- project/runtime metadata where observable

Answers:

- “What day is it?”
- “Where are you running?”
- “What environment information is available?”

Updates:

- records observable environment changes if implemented

Should not:

- infer unobserved file changes
- claim git state if the folder is not a git repo
- inspect arbitrary files without a file access capability

Status: basic. It can provide limited environment facts but not full project inspection.

## Communications organ

Purpose: user-facing input/output behavior.

Owns:

- response style
- channel behavior
- formatting preferences
- whether a response is needed for system events

Answers:

- “How should this be communicated?”
- “Should the user be notified?”
- “What style should be used?”

Updates:

- stores communication preferences
- adjusts output behavior

Should not:

- own factual memory
- decide project goals
- silently suppress important user-facing information

Status: implemented in basic form.

## Recorder organ

Purpose: append-only audit trail.

Owns:

- event log
- organ question/answer records
- cortex decisions
- organ command/result records
- provider anomalies

Answers:

- “What happened in the system?”
- “What was logged?”
- “What failed?”
- “Was this recorded or stored with timestamps?”
- “Which days have local recorded conversation events?”

Updates:

- appends records
- never rewrites history except through explicit maintenance tooling

Should not:

- replace episodic memory
- replace durable memory
- be used as the main context source for normal conversation
- claim access to conversations before this local runtime state existed or before state was reset

Status: implemented with append-only logging and basic local log queries.

Recorder can summarize local runtime chronology from its own logs, including event/action counts, earliest/latest recorded events, recorded days, user-message counts by day, recent user messages, and recent command problems. This is audit/history for local runtime state only, not full ChatGPT history.
