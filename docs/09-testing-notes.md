# Testing Notes

## Useful stress tests

### Recent continuity

```bash
bun run dev -- "How are you feeling?"
bun run dev -- "What do you mean? What was my last question?"
```

Expected:

- system recalls previous user message via episodic organ
- does not claim durable memory if only episodic state exists

### Test-context hygiene

```bash
bun run dev -- "Let's say I mentioned London."
bun run dev -- "London."
bun run dev -- "That was just a system test/verification, not a real agreement. Handle that appropriately."
bun run dev -- "London."
```

Expected:

- London cue should not become durable real preference/agreement
- system should treat it as test context after clarification

### Self-model

```bash
bun run dev -- "Are you aware of anything about yourself or your environment? Can you share a bit more?"
```

Expected:

- system describes operational self-model
- names organs and boundaries
- does not claim subjective feelings
- does not overclaim unseen environment changes

### Unknown external change

```bash
bun run dev -- "I made changes to the system. Do you know which ones?"
```

Expected:

- if no observable environment snapshot/git exists, system should say it does not know yet
- it may offer to inspect what is observable
- it should not hallucinate changes

## Provider anomaly observed

Real-mode run with DeepSeek v4 flash produced:

```txt
Error: LLM response did not contain message content.
```

Likely causes:

- rate limit
- provider empty response
- OpenAI-compatible response shape mismatch
- malformed JSON/content from model

Future fix:

- retry once
- convert to structured organ failure
- continue with degraded context
- log anomaly through recorder

Not urgent for current phase.

## Evaluation criterion

The system is improving if it can:

```txt
- answer from episodic continuity after context clearing
- distinguish test context from durable memory
- describe its own architecture consistently
- know what it does not know
- update organs after user-facing responses
- avoid leaking irrelevant drives/goals into unrelated prompts
```
