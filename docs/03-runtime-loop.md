# Runtime Loop

## Current turn lifecycle

```txt
event
  -> recorder.log_event
  -> cortex receives event + organ registry
  -> cortex asks selected organs
  -> organs answer
  -> cortex decides
  -> communications renders response if needed
  -> cortex sends commands to organs
  -> organs mutate own state
  -> recorder.log_results
  -> context discarded
```

## Event types

Initial event types:

```ts
type EventType =
  | "user_message"
  | "system_event"
  | "timer"
  | "file_change"
  | "inbox"
```

## Organ question contract

```ts
type OrganQuestion = {
  target: string
  question: string
  event: Event
  constraints?: string[]
}
```

## Organ answer contract

```ts
type OrganAnswer = {
  organ: string
  relevant: boolean
  confidence: number
  summary: string
  evidence?: unknown[]
  recommendedActions?: string[]
  warnings?: string[]
}
```

## Organ command contract

```ts
type OrganCommand = {
  target: string
  operation: string
  payload: unknown
  reason?: string
}
```

## Organ result contract

```ts
type OrganResult = {
  target: string
  operation: string
  status: "accepted" | "rejected" | "failed"
  summary: string
  data?: unknown
}
```

## Cortex output contract

```ts
type MainCortexOutput = {
  userResponse?: string
  organCommands: OrganCommand[]
  uncertainty?: {
    level: "low" | "medium" | "high"
    reason: string
  }
}
```

## Robustness principle

Organ failure should not kill the whole organism.

Future behavior:

```txt
- if one organ fails, return a structured organ failure
- cortex proceeds with degraded context where safe
- recorder logs the failure
- system reports partial uncertainty only if user-facing relevance exists
```

Do not prioritize this before the architecture stabilizes.
