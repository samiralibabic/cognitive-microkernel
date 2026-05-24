import type { Event, Organ, OrganAnswer, OrganCommand, OrganQuestion, OrganResult } from "../schemas";
import { appendJsonl, nowIso, readJsonl } from "../state";

type EventLogEntry = {
  timestamp: string;
  event_id: string;
  kind: string;
  payload: unknown;
};

type ActionLogEntry = {
  timestamp: string;
  event_id: string;
  command: unknown;
};

type RecordedDay = {
  date: string;
  events: number;
  user_messages: number;
};

type RecentUserMessage = {
  timestamp: string;
  event_id: string;
  content: string;
  source?: string;
};

type RecentEvent = {
  timestamp: string;
  event_id: string;
  kind: string;
};

type RecentCommandProblem = {
  timestamp: string;
  event_id: string;
  target?: string;
  operation?: string;
  status: string;
  summary?: string;
};

type LogSummary = {
  events_log_entries: number;
  actions_log_entries: number;
  earliest_event?: string;
  latest_event?: string;
  recorded_days: RecordedDay[];
  current_event_recorded: boolean;
  current_event_record_kind?: string;
  current_event_record_timestamp?: string;
  recent_user_messages: RecentUserMessage[];
  recent_events: RecentEvent[];
  recent_command_problems: RecentCommandProblem[];
};

const RECENT_USER_MESSAGES = 8;
const RECENT_EVENTS = 10;
const RECENT_COMMAND_PROBLEMS = 8;
const MAX_CONTENT_LENGTH = 220;

export class RecorderOrgan implements Organ {
  name = "recorder";
  responsibility = "Append-only audit history: events, organ questions, answers, cortex decisions, commands, and command results.";

  async sense(question: OrganQuestion): Promise<OrganAnswer> {
    const auditRelevant = looksAuditRelevant(`${question.question}\n${question.event.content}`);

    if (!auditRelevant) {
      return {
        organ: this.name,
        relevant: false,
        confidence: 0.4,
        summary: "Recorder is available for append-only audit logging. No audit, storage, timestamp, or chronology question was detected.",
        evidence: [],
        recommendedActions: [],
      };
    }

    const [events, actions] = await Promise.all([this.loadEventLog(), this.loadActionLog()]);
    const logSummary = summarizeLogState(events, actions, question.event.id);

    return {
      organ: this.name,
      relevant: true,
      confidence: 0.9,
      summary: buildAuditSummary(logSummary),
      evidence: [logSummary],
      recommendedActions: [],
      warnings: ["Recorder only knows local runtime logs since state was created or last reset; it does not have the user's full ChatGPT history."],
    };
  }

  private async loadEventLog(): Promise<EventLogEntry[]> {
    return readJsonl<EventLogEntry>("events.jsonl");
  }

  private async loadActionLog(): Promise<ActionLogEntry[]> {
    return readJsonl<ActionLogEntry>("actions.jsonl");
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

function summarizeLogState(events: EventLogEntry[], actions: ActionLogEntry[], currentEventId: string): LogSummary {
  const { earliest, latest } = getEarliestLatest(events);
  const currentEventRecord = findEventById(events, currentEventId);

  return {
    events_log_entries: events.length,
    actions_log_entries: actions.length,
    earliest_event: earliest,
    latest_event: latest,
    recorded_days: getDistinctDays(events),
    current_event_recorded: Boolean(currentEventRecord),
    current_event_record_kind: currentEventRecord?.kind,
    current_event_record_timestamp: currentEventRecord?.timestamp,
    recent_user_messages: getRecentUserMessages(events, RECENT_USER_MESSAGES),
    recent_events: getRecentEvents(events, RECENT_EVENTS),
    recent_command_problems: getRecentCommandProblems(events, RECENT_COMMAND_PROBLEMS),
  };
}

function buildAuditSummary(summary: LogSummary): string {
  const current = summary.current_event_recorded
    ? ` The current event is already present in the event log as ${summary.current_event_record_kind} at ${summary.current_event_record_timestamp}.`
    : " The current event was not found in the event log snapshot.";
  const span = summary.earliest_event && summary.latest_event
    ? ` Earliest event: ${summary.earliest_event}. Latest event: ${summary.latest_event}.`
    : " No timestamped event records were found.";
  const days = summary.recorded_days.length
    ? ` Recorded days: ${summary.recorded_days.map((d) => `${d.date}: ${d.user_messages} user messages, ${d.events} audit events`).join("; ")}.`
    : " No recorded days were extractable.";
  const messages = summary.recent_user_messages.length
    ? ` Recent user-message chronology is available for ${summary.recent_user_messages.length} message${summary.recent_user_messages.length === 1 ? "" : "s"}.`
    : " No recent user-message records were extractable.";

  return `Recorder has timestamped local audit logs stored in local runtime state: ${summary.events_log_entries} event entries and ${summary.actions_log_entries} action entries.${current}${span}${days}${messages}`;
}

function getEarliestLatest(events: EventLogEntry[]) {
  const timestamps = events.map((event) => event.timestamp).filter((timestamp) => typeof timestamp === "string" && timestamp.trim()).sort();
  return { earliest: timestamps[0], latest: timestamps[timestamps.length - 1] };
}

function getDistinctDays(events: EventLogEntry[]): RecordedDay[] {
  const byDay = new Map<string, RecordedDay>();

  for (const event of events) {
    const date = getDatePart(event.timestamp);
    if (!date) continue;

    const day = byDay.get(date) ?? { date, events: 0, user_messages: 0 };
    day.events += 1;
    if (extractUserMessage(event)) day.user_messages += 1;
    byDay.set(date, day);
  }

  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function getRecentUserMessages(events: EventLogEntry[], limit: number): RecentUserMessage[] {
  const messages: RecentUserMessage[] = [];

  for (const event of events) {
    const message = extractUserMessage(event);
    if (message) messages.push(message);
  }

  return messages.slice(-limit);
}

function getRecentEvents(events: EventLogEntry[], limit: number): RecentEvent[] {
  return events.slice(-limit).map((event) => ({
    timestamp: event.timestamp,
    event_id: event.event_id,
    kind: event.kind,
  }));
}

function getRecentCommandProblems(events: EventLogEntry[], limit: number): RecentCommandProblem[] {
  const problems: RecentCommandProblem[] = [];

  for (const event of events) {
    const problem = extractCommandProblem(event);
    if (problem) problems.push(problem);
  }

  return problems.slice(-limit);
}

function findEventById(events: EventLogEntry[], eventId: string): EventLogEntry | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].event_id === eventId && events[i].kind === "event_received") return events[i];
  }

  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].event_id === eventId) return events[i];
  }
  return undefined;
}

function extractUserMessage(event: EventLogEntry): RecentUserMessage | undefined {
  if (event.kind !== "event_received" || !isRecord(event.payload)) return undefined;
  if (event.payload.type !== "user_message" || typeof event.payload.content !== "string") return undefined;

  return {
    timestamp: typeof event.payload.timestamp === "string" ? event.payload.timestamp : event.timestamp,
    event_id: event.event_id,
    content: truncate(event.payload.content, MAX_CONTENT_LENGTH),
    source: typeof event.payload.source === "string" ? event.payload.source : undefined,
  };
}

function extractCommandProblem(event: EventLogEntry): RecentCommandProblem | undefined {
  if (event.kind !== "organ_command_result" || !isRecord(event.payload)) return undefined;

  const result = event.payload.result;
  if (!isRecord(result) || (result.status !== "failed" && result.status !== "rejected")) return undefined;

  const command = event.payload.command;

  return {
    timestamp: event.timestamp,
    event_id: event.event_id,
    target: isRecord(command) && typeof command.target === "string" ? command.target : undefined,
    operation: isRecord(command) && typeof command.operation === "string" ? command.operation : undefined,
    status: String(result.status),
    summary: typeof result.summary === "string" ? truncate(result.summary, MAX_CONTENT_LENGTH) : undefined,
  };
}

function getDatePart(timestamp: string): string | undefined {
  return typeof timestamp === "string" && timestamp.length >= 10 ? timestamp.slice(0, 10) : undefined;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function looksAuditRelevant(text: string): boolean {
  return /\b(recorded|recording|record|stored|storage|timestamp|timestamps|timestamped|audit|audited|log|logs|logged|history|chronology|chronological|earliest|latest|what happened in the system|what was logged|what failed|recent recorded|recent turns|recent messages|days? (did|do|have|on|we)|when did we talk|which days)\b/i.test(text);
}
