# Drives and Agency

## Current status

The runtime currently has drives/goals state, but not a full autonomous loop.

The system can answer user-triggered events using goals, but it does not yet initiate work from its own drives in a mature way.

## Desired direction

Borrow ideas from the prior open-ended-agent-harness experiment carefully, without bloating this runtime.

Agency should emerge from:

```txt
- drives/goals organ
- environment/events organ
- scheduler/heartbeat later
- permission-gated tools organ
- communications organ deciding whether user notification is needed
- recorder audit trail
```

## Drive loop concept

```txt
timer/system event
  -> drives asks: is anything active/stale/urgent?
  -> environment asks: has anything changed?
  -> tools asks: can action be taken safely?
  -> cortex decides: act silently, ask user, notify user, or do nothing
  -> organs update state
```

## Important constraint

Do not add autonomy before boundaries are clean.

Before autonomous loop:

- organ contracts stable
- recorder reliable
- communications profile stable
- tools permissions defined
- environment observations honest
- state mutation policy clear

## Free will / drives note

The system does not need “free will” to show agency. It needs explicit drives, priorities, event triggers, and permitted actions.

A useful first drive is not “do anything useful.” It is:

```txt
Maintain and improve the organ runtime project when explicitly activated or when a scheduled local development event fires.
```
