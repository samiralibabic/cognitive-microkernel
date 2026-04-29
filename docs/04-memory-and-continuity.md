# Memory and Continuity

## Problem observed

Early v0 had durable long-term memory but weak recent continuity. This created a bad balance:

```txt
memory of a fish + long-term memory of a computer
```

The fix is layered memory.

## Memory layers

```txt
episodic organ       -> recent turns + rolling working summary
memory organ         -> durable curated facts/preferences/decisions
communications organ -> style/channel behavior profile
self-model organ     -> system identity/capabilities/limits
recorder organ       -> append-only audit trail
```

## Episodic memory

Used for:

- “What do you mean?”
- “What was my last message?”
- “What happened over the last few turns?”
- resolving “this”, “that”, “previous”, “above”
- short test sequences

It should not automatically become durable memory.

## Durable memory

Used for:

- stable user preferences
- durable project decisions
- important facts
- long-lived constraints
- recurring workflows

It should not store every sentence.

## Memory hygiene

The system should distinguish:

```txt
real preference / durable decision
vs.
temporary test / stress-test cue / joke / throwaway context
```

Example:

```txt
"Let's say I mentioned London"
```

During a stress test, this should remain episodic/test context unless explicitly promoted.

If later clarified as a test:

```txt
"That was just a system test/verification"
```

The memory organ should deactivate or avoid promoting the item.

## Preference ownership

Not all preferences belong in memory.

```txt
Communication preferences -> communications organ
Decision preferences      -> drives organ
Project facts             -> memory/project organ
Workflow/tool preferences -> tools organ
Topic interests           -> memory organ
System identity/limits    -> self-model organ
```

Example:

```txt
"User prefers short direct answers"
```

This should become an active communications profile, not a topical memory retrieved every turn.
