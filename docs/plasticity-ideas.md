# Future Direction: Plasticity

## Purpose

Explore how Cognitive Microkernel can improve from experience over time while keeping the architecture lean.

The long-term goal is a system that can:

* use recent experience immediately
* preserve durable lessons across sessions
* keep feedback tied to context
* improve future decisions from recorded outcomes
* eventually support learned internal change when practical
* explain which evidence influenced a response or action

This document is future direction, not current implementation scope.

## Existing architecture

Build on the current core:

* Cortex handles current-event reasoning.
* Organs own persistent state.
* Recorder preserves the audit trail.

Plasticity work should extend this loop:

```
event
  -> recorder logs event
  -> cortex consults relevant organs
  -> organs answer from owned state
  -> cortex responds or acts
  -> recorder logs result
  -> cortex sends state-update commands where useful
  -> organs update owned state
```

New components should be added only when existing components cannot carry the responsibility cleanly.

## Core idea

Learning is a routing and consolidation problem.

When new experience appears, the system needs to decide where that experience belongs:

* current working context
* episodic state
* durable memory
* drives / goal state
* communication state
* self-model state
* future learned component
* no durable update

The important work is classification, provenance, and later consolidation.

## Learning targets

### Working context

Immediate information for the current turn.

Investigate:

* how much recent context the cortex needs
* when recent context is enough
* how organ answers are prioritized
* how conflicting organ answers are handled
* how uncertainty is represented in the current turn

Expected outcome:

* better current-event reasoning without unnecessary durable state updates

### Episodic state

Concrete recent experiences.

Investigate:

* compact episode representation
* attaching outcomes to prior actions
* attaching later feedback to the right episode
* retrieval by recency, similarity, and salience
* expiration or downranking of old episodes

Candidate episode fields:

```
event
situation
action
context_used
outcome
feedback
salience
uncertainty
timestamp
provenance
```

Expected outcome:

* the cortex can use relevant prior experience as context for reasoning

### Durable memory

Stable knowledge across sessions.

Investigate:

* when an episode becomes durable memory
* how confidence is represented
* how contradictions revise existing memory
* how durable memory stays compact
* how provenance is preserved for promoted memories

Expected outcome:

* durable memory becomes selective, traceable, and useful for future reasoning

### Drives and priority state

Goals, open loops, relevance, and next actions.

Investigate:

* how outcomes change priorities
* how stale goals are detected
* how completed loops are closed
* how active goals influence action selection
* how competing goals are ranked

Expected outcome:

* better continuity of purpose across events and sessions

### Communication state

Interaction behavior and response preferences.

Investigate:

* how feedback changes future communication
* how temporary interaction context differs from stable preference
* how communication preferences are represented
* how the system explains communication choices when asked

Expected outcome:

* interaction improves over time without scattering style guidance through unrelated state

### Self-model state

Capabilities, limits, architecture, and provenance behavior.

Investigate:

* how capability changes are recorded
* how failed actions update capability understanding
* how the system explains what it knows and how it knows it
* how architecture docs and self-model state stay aligned

Expected outcome:

* more accurate self-reporting and better provenance answers

### Future learned components

Potential parametric or learned behavior.

Investigate:

* retrieval ranking
* memory promotion scoring
* action preference scoring
* ask / act / stop scoring
* goal-priority scoring
* adapter or fine-tune candidates
* model-level consolidation when practical

Expected outcome:

* recorded experience becomes usable training and evaluation material

## Plasticity protocol

After meaningful feedback, correction, success, failure, contradiction, or repeated outcome, the cortex classifies the learning target.

Candidate classification output:

```
{
  "changed": true,
  "target": "working_context | episodic_state | durable_memory | drives_state | communication_state | self_model_state | learned_component_candidate | none",
  "summary": "...",
  "reason": "...",
  "evidence": ["..."],
  "confidence": 0.0,
  "uncertainty": "...",
  "recommended_command": {
    "target": "...",
    "operation": "...",
    "payload": {}
  }
}
```

The classification should answer:

1. What changed?
2. Which existing organ owns the relevant state?
3. Is the change temporary, episodic, durable, behavioral, goal-related, capability-related, or training-relevant?
4. What evidence supports the change?
5. What uncertainty remains?
6. What future behavior should this influence?
7. How can the system explain this later?

## Milestones

### Milestone 1: Learning classification sketch

Define the classification schema and routing rules.

Deliverables:

* classification schema
* examples for each target
* organ command examples
* recorder fields needed for provenance
* tests for routing feedback to the correct existing organ

Success criteria:

* feedback can be classified without creating new architecture
* temporary feedback stays temporary
* durable updates include evidence and confidence
* recorder can explain what changed and why

### Milestone 2: Episode representation

Define a compact episode format using existing recorder and episodic mechanisms.

Deliverables:

* episode schema
* salience field
* outcome field
* feedback attachment mechanism
* retrieval criteria

Success criteria:

* meaningful recent experiences can be stored
* later feedback can be attached to the correct episode
* relevant episodes can be surfaced to the cortex

### Milestone 3: Memory promotion path

Define how episodic experience becomes durable memory.

Deliverables:

* promotion criteria
* contradiction handling
* confidence handling
* provenance requirements
* examples of promoted and unpromoted experiences

Success criteria:

* durable memory remains compact
* promoted memory has evidence
* contradictions revise prior state cleanly

### Milestone 4: Outcome-aware drives

Use recorded outcomes to improve goal and priority handling.

Deliverables:

* stale-goal detection sketch
* completed-loop detection sketch
* next-action ranking sketch
* recorder fields for goal outcomes

Success criteria:

* active goals remain useful across sessions
* stale goals lose priority
* completed loops close cleanly
* next actions stay traceable

### Milestone 5: Experience-derived evals

Create small behavioral checks from recorded failures, corrections, and successful outcomes.

Deliverables:

* eval case format
* first small set of eval cases
* expected behavior fields
* regression reporting format

Success criteria:

* behavior changes can be checked against prior cases
* regressions are visible
* evals remain generic and architecture-level

### Milestone 6: Learned component experiments

Use accumulated experience to train or tune small learned components before model-level updates.

Candidate experiments:

* retrieval ranker
* memory-promotion scorer
* action-preference scorer
* ask / act / stop scorer
* goal-priority scorer

Success criteria:

* learned component improves experience-derived evals
* provenance remains available
* component can be disabled or replaced
* broad behavior remains stable

### Milestone 7: Parametric consolidation

Investigate direct model or adapter updates from consolidated experience.

Candidate methods:

* supervised fine-tuning
* preference optimization
* adapter training
* narrow model editing
* learned retrieval or policy modules

Success criteria:

* trained behavior improves eval results
* broad capability remains stable
* updates are versioned
* rollback is available
* training data provenance is preserved

## Research questions

* What makes an event worth storing?
* How should salience be estimated?
* How should feedback be attached to earlier actions?
* How should conflicting state be resolved?
* How should recent episodes and durable memory be balanced?
* How should context-dependent feedback stay context-dependent?
* Which learning targets produce the most improvement with the least added complexity?
* Which learned components are worth training first?
* How fast can the loop run in interactive use?
* What is the smallest useful bridge from external state to learned internal behavior?

## Near-term next action

Start with Milestone 1 only.

Create a short design note for learning classification:

* schema
* target definitions
* examples
* recorder requirements
* organ command examples
* minimal tests

Then review whether the existing organs can support the protocol cleanly before implementing more.
