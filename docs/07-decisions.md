# Design Decisions

## Decision 1: Organ architecture over monolithic agent

Use a stateless/near-stateless main cortex and persistent organs.

Reason: avoids treating the context window as the whole organism.

## Decision 2: Organs are LLM-backed specialist agents

Organs are not just CRUD modules or heuristic routers.

Reason: each organ needs judgment about relevance, mutation, conflict, uncertainty, decay, and domain-specific state.

## Decision 3: Add episodic organ

Short-term conversational continuity belongs in an episodic/working-memory organ.

Reason: durable memory should not store every sentence, but the system must remember recent turns.

## Decision 4: Add self-model organ

Operational self-awareness belongs in a self-model organ.

Reason: the system needs persistent knowledge of its own architecture, organs, capabilities, and limits.

## Decision 5: Keep recorder separate from memory

Recorder is append-only audit history, not conversational memory.

Reason: auditability and continuity are different responsibilities.

## Decision 6: Environment exists but should not overclaim

The environment organ should report what it can observe, not infer impossible facts.

Reason: in a non-version-controlled folder, it cannot know manual file replacement history unless a snapshot mechanism exists.

## Decision 7: Remove or deprioritize mock mode

Mock mode is less useful now that real provider testing is cheap enough.

Reason: canned mock responses can obscure real behavior. Real-mode stress tests are more valuable.

## Decision 8: Do not rush robustness/autonomy yet

Provider failures, organ failure handling, richer environment sensing, and autonomous drives matter, but should not be rushed.

Reason: the current priority is clean boundaries and repo documentation.

## Decision 9: Move from zip handoff to git repo

Initialize a git repository and push to GitHub.

Reason: avoid zip ping-pong and preserve continuity outside ephemeral chat.
