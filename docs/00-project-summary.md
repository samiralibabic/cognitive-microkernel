# Project Summary

## Working name

Organ Runtime v0

## Purpose

Build a local prototype of an organ-based agent runtime where a stateless main cortex coordinates persistent, LLM-backed specialist organs.

## Core problem

Standard LLM agents usually treat the model/context window as the whole organism. That makes the system dependent on prompt context, long transcripts, tool manifests, and fragile memory injection.

This project moves continuity out of the main context window and into dedicated state-owning organs.

## Core thesis

```txt
context window = transient operational thought space
main cortex    = executive reasoner for the current turn
organs         = persistent specialist agents with owned state
recorder       = append-only life history
```

A turn can start from a fresh context because organs reconstruct relevant state and receive post-turn mutation commands.

## What makes this different

This is not merely:

```txt
LLM + tools + memory database
```

It is:

```txt
main cortex LLM
+ memory organ LLM + memory state
+ episodic organ LLM + recent-turn state
+ self-model organ LLM + system identity/capability state
+ drives organ LLM + goals/open loops
+ tools organ LLM + capability registry
+ environment organ LLM + runtime observations
+ communications organ LLM + response/channel profile
+ recorder organ + append-only log
```

The organs are not dumb CRUD modules. Each organ is intended to have its own local cognition within a bounded domain.

## Current development posture

Keep the architecture clean. Do not rush autonomy, tool execution, schedulers, self-modification, or remote integrations before the core loop is stable.
