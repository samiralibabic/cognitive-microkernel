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
