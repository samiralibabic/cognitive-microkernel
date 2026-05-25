# Decisions

This file records design decisions that are likely to matter later.

## 0001 — Project name: Cognitive Microkernel

Status: accepted

Decision: use “Cognitive Microkernel” as the project name.

Reason: it captures the intended architecture: a small executive core coordinating persistent specialist subsystems.

## 0002 — Stateless cortex, persistent organs

Status: accepted

Decision: keep the main cortex stateless or near-stateless. Persist continuity in organs.

Reason: the context window should be working space, not the system’s memory.

Consequence: each turn needs explicit organ consultation and post-turn organ updates.

## 0003 — Organs are LLM-backed subsystems

Status: accepted

Decision: an organ is not a CRUD module. It is a specialist agent with bounded responsibility and owned state.

Reason: organs need judgment about relevance, mutation, uncertainty, contradiction, and decay.

Consequence: helper functions and storage are implementation details inside organs, not replacements for organs.

## 0004 — Add episodic organ

Status: accepted

Decision: recent-turn continuity belongs in a dedicated episodic organ.

Reason: durable memory should not store every sentence, but the system still needs to handle local references and recent-turn recall.

## 0005 — Add self-model organ

Status: accepted

Decision: operational self-awareness belongs in a dedicated self-model organ.

Reason: the system needs stable knowledge of its own architecture, organs, capabilities, and limitations.

Consequence: the system can answer questions about itself without inventing inconsistent identity claims.

## 0006 — Recorder is audit, not memory

Status: accepted

Decision: keep recorder separate from episodic and durable memory.

Reason: audit history and conversational continuity are different responsibilities.

## 0007 — Keep environment honest

Status: accepted

Decision: environment organ should report only observable facts.

Reason: if the runtime has no file-reading tool, git repo, or snapshot mechanism, it cannot know which files changed.

## 0008 — Do not rush autonomy

Status: accepted

Decision: delay autonomous drive loop until boundaries, permissions, and logs are clearer.

Reason: autonomy without clean capabilities and auditability will create fragile behavior.

## 0009 — Next major capability: read-only project awareness

Status: proposed

Decision: add read-only project inspection before write actions or shell execution.

Reason: the system needs eyes before hands.

Initial boundary:

- current project directory only
- no `.env`
- no arbitrary home-directory access
- no writes
- every read logged

## 0010 — Bounded consultation rounds

Status: accepted

Decision: allow the cortex at most two consultation rounds before finalizing.

Reason: one targeted follow-up round gives the cortex a way to repair missing evidence without creating open-ended organ chatter.

Consequence: organs still do not coordinate with each other; any follow-up questions remain cortex-owned and bounded.

## 0011 — Native tool-calling harness

Status: accepted

Decision: use OpenAI/OpenRouter-compatible native tool calls for structured cortex and organ control outputs.

Reason: free-form JSON parsing made control flow brittle and caused user-turn crashes when model text was not parseable JSON.

Consequence: model calls now produce traceable tool calls, finish reasons, tool results, and protocol errors.

## 0012 — Final tools are control outputs

Status: accepted

Decision: represent structured method completion as final tools such as `final_organ_questions`, `final_organ_answer`, `continue_consultation`, `final_cortex_output`, and `final_rendered_response`.

Reason: final tools give each model method an explicit typed exit path instead of relying on assistant prose.

Consequence: structured calls fail closed with protocol warnings or fallbacks instead of accepting malformed plain text.

## 0013 — Capability status classification

Status: accepted

Decision: tool capabilities carry explicit status values: `implemented`, `registered_not_executable`, `planned`, or `deprecated`.

Reason: a listed or planned capability is not the same as an executable runtime capability.

Consequence: the tools organ must report `mcp_adapter` as planned and must not present registered-only capabilities as available execution paths.

## 0014 — Observe tools before finalization

Status: accepted

Decision: do not accept a `final_*` tool call from a model response that also contains non-final runtime tool calls.

Reason: accepting early final output can skip evidence-gathering tools and make unsupported answers look evidence-based.

Consequence: the harness executes non-final tools first, returns a premature-finalization warning for same-message final calls, and accepts final output only after tool results have been observed in a later model response.

## 0015 — No normal-path communications render pass

Status: accepted

Decision: emit cortex userResponse directly instead of sending it through a second LLM communications render call.

Reason: the render pass added latency, cost, trace noise, and another strict tool-call failure point after the cortex had already finalized.

Consequence: Communications remains available for style/profile sensing and profile updates, but normal user-visible output comes directly from the cortex.
