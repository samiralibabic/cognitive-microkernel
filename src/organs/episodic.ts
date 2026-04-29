import type { Event, Organ, OrganAnswer, OrganCommand, OrganQuestion, OrganResult } from "../schemas";
import { LlmClient } from "../llm";
import { makeId, nowIso, readJsonFile, writeJsonFile } from "../state";

export type EpisodicTurn = {
  id: string;
  event_id: string;
  event_type: Event["type"];
  timestamp: string;
  user_message?: string;
  assistant_response?: string;
  source?: string;
  organ_answer_summaries?: Array<{ organ: string; relevant: boolean; confidence: number; summary: string }>;
};

export type EpisodicState = {
  working_summary: string;
  turns: EpisodicTurn[];
  updated_at: string;
};

const DEFAULT_STATE: EpisodicState = {
  working_summary: "No prior episodic context stored yet.",
  turns: [],
  updated_at: nowIso(),
};

const MAX_TURNS = 100;
const RECENT_TURNS = 8;

export class EpisodicOrgan implements Organ {
  name = "episodic";
  responsibility = "LLM-backed short-term/episodic continuity: recent turns, deictic references, rolling working summary, and conversation-local context.";

  constructor(private readonly llm: LlmClient) {}

  private async load() {
    return readJsonFile<EpisodicState>("episodic.json", DEFAULT_STATE);
  }

  private async save(state: EpisodicState) {
    await writeJsonFile("episodic.json", state);
  }

  async sense(question: OrganQuestion): Promise<OrganAnswer> {
    const state = await this.load();
    const recent = state.turns.slice(-RECENT_TURNS);
    const needsContinuity = looksLikeContinuityRequest(question.event.content);

    if (this.llm.isMock()) {
      if (recent.length === 0) {
        return {
          organ: this.name,
          relevant: false,
          confidence: 0.75,
          summary: "No recent episodic turns stored yet.",
          evidence: [],
        };
      }

      const last = recent[recent.length - 1];
      const recentSummary = recent.map((t, idx) => {
        const n = recent.length - idx;
        const user = t.user_message ? `user: ${truncate(t.user_message, 140)}` : undefined;
        const assistant = t.assistant_response ? `assistant: ${truncate(t.assistant_response, 180)}` : undefined;
        return `-${n}: ${[user, assistant].filter(Boolean).join(" | ")}`;
      }).join("\n");

      return {
        organ: this.name,
        relevant: needsContinuity || recent.length > 0,
        confidence: needsContinuity ? 0.92 : 0.7,
        summary: [
          `Working summary: ${state.working_summary}`,
          last?.user_message ? `Previous user message: ${last.user_message}` : undefined,
          last?.assistant_response ? `Previous assistant response: ${last.assistant_response}` : undefined,
          needsContinuity ? "The current request appears to refer to recent conversation context." : "Recent turns are available for continuity if needed.",
        ].filter(Boolean).join("\n"),
        evidence: [{ working_summary: state.working_summary, recent_turns: recentSummary }],
      };
    }

    return this.llm.chatJson<OrganAnswer>([
      {
        role: "system",
        content: `You are the Episodic/Working-Memory organ in an organ-based agent runtime.
You own short-term conversation continuity: recent turns, deictic references, and a rolling working summary.
Return only valid JSON matching OrganAnswer:
{
  "organ":"episodic",
  "relevant":boolean,
  "confidence":0-1,
  "summary":"compact continuity context for the main cortex, or why nothing is relevant",
  "evidence":[...],
  "recommendedActions":[...],
  "warnings":[...]
}
Rules:
- Use recent turns and working summary only; do not invent facts.
- If the user asks "what do you mean", "what was my last question", "defined where", or uses unclear references like "that/this/it", recent context is highly relevant.
- Do not promote recent details to long-term memory. That is memory organ's job.
- Return compact context, not full transcript, unless the user explicitly asks for exact previous wording.`,
      },
      {
        role: "user",
        content: JSON.stringify({ question, working_summary: state.working_summary, recent_turns: recent, likely_continuity_request: needsContinuity }, null, 2),
      },
    ], { temperature: 0.1 });
  }

  async act(command: OrganCommand, event: Event): Promise<OrganResult> {
    const state = await this.load();

    if (["record_turn", "append_turn", "capture_exchange"].includes(command.operation)) {
      const payload = command.payload as Record<string, unknown>;
      const assistant = String(payload.rendered_response ?? payload.assistant_response ?? payload.response ?? "").trim();
      const user = String(payload.user_message ?? event.content ?? "").trim();
      const summaries = Array.isArray(payload.organ_answer_summaries)
        ? payload.organ_answer_summaries as EpisodicTurn["organ_answer_summaries"]
        : undefined;

      const turn: EpisodicTurn = {
        id: makeId("turn"),
        event_id: event.id,
        event_type: event.type,
        timestamp: nowIso(),
        user_message: user || undefined,
        assistant_response: assistant || undefined,
        source: event.source,
        organ_answer_summaries: summaries,
      };

      state.turns.push(turn);
      state.turns = state.turns.slice(-MAX_TURNS);
      state.working_summary = await this.updateWorkingSummary(state, turn);
      state.updated_at = nowIso();
      await this.save(state);

      return {
        target: this.name,
        operation: command.operation,
        status: "accepted",
        summary: `Recorded episodic turn ${turn.id}.`,
        data: { id: turn.id, turns_stored: state.turns.length, working_summary: state.working_summary },
      };
    }

    if (["update_summary", "summarize"].includes(command.operation)) {
      const payload = command.payload as Record<string, unknown>;
      state.working_summary = String(payload.summary ?? payload.content ?? state.working_summary).slice(0, 4000);
      state.updated_at = nowIso();
      await this.save(state);
      return { target: this.name, operation: command.operation, status: "accepted", summary: "Updated episodic working summary." };
    }

    return { target: this.name, operation: command.operation, status: "rejected", summary: "Unsupported episodic operation in v0." };
  }

  private async updateWorkingSummary(state: EpisodicState, turn: EpisodicTurn): Promise<string> {
    if (this.llm.isMock()) {
      const previous = state.working_summary === DEFAULT_STATE.working_summary ? "" : state.working_summary;
      const addition = [
        turn.user_message ? `User: ${truncate(turn.user_message, 220)}` : undefined,
        turn.assistant_response ? `Assistant: ${truncate(turn.assistant_response, 260)}` : undefined,
      ].filter(Boolean).join(" | ");
      return truncate([previous, addition].filter(Boolean).join("\n"), 2500) || DEFAULT_STATE.working_summary;
    }

    const result = await this.llm.chatJson<{ summary: string }>([
      {
        role: "system",
        content: `You are the Episodic organ. Update the rolling working summary after a turn.
Return only valid JSON: {"summary":"..."}
Rules:
- Preserve recent conversational continuity, references, and unresolved local context.
- Do not store every sentence verbatim.
- Do not promote stable long-term preferences or decisions as if you own long-term memory; mention them only as current conversation context.
- Keep under 1200 words.`,
      },
      {
        role: "user",
        content: JSON.stringify({ previous_summary: state.working_summary, new_turn: turn, recent_turns: state.turns.slice(-RECENT_TURNS) }, null, 2),
      },
    ], { temperature: 0.1 });

    return result.summary.slice(0, 6000);
  }
}

function looksLikeContinuityRequest(text: string): boolean {
  return /\b(what do you mean|what did you mean|what are you talking about|defined where|where did.*define|last question|last message|previous|earlier|above|before|continue|where were we|what organ|which organ|what was my|what did i|that|this|it)\b/i.test(text);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
