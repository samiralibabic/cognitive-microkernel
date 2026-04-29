import type { Event, Organ, OrganAnswer, OrganCommand, OrganQuestion, OrganResult } from "../schemas";
import { appendJsonl, nowIso } from "../state";

export class RecorderOrgan implements Organ {
  name = "recorder";
  responsibility = "Append-only audit history: events, organ questions, answers, cortex decisions, commands, and command results.";

  async sense(question: OrganQuestion): Promise<OrganAnswer> {
    return {
      organ: this.name,
      relevant: true,
      confidence: 0.8,
      summary: "Recorder is available to log this turn and preserve audit history. It can also receive explicit append commands.",
      evidence: [],
    };
  }

  async act(command: OrganCommand, event: Event): Promise<OrganResult> {
    await appendJsonl("actions.jsonl", {
      timestamp: nowIso(),
      event_id: event.id,
      command,
    });
    return {
      target: this.name,
      operation: command.operation,
      status: "accepted",
      summary: "Appended command payload to action log.",
    };
  }

  async record(kind: string, event: Event, payload: unknown) {
    await appendJsonl("events.jsonl", {
      timestamp: nowIso(),
      event_id: event.id,
      kind,
      payload,
    });
  }
}
