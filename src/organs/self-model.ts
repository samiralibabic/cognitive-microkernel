import type { Event, Organ, OrganAnswer, OrganCommand, OrganQuestion, OrganResult } from "../schemas";
import { LlmClient } from "../llm";
import { runOrganAnswerHarness } from "../harness/organ-answer";
import type { ToolTraceRecorder } from "../harness/tooling";
import { nowIso, readJsonFile, writeJsonFile } from "../state";

export type SelfModelState = {
  system_name: string;
  architecture: string;
  role: string;
  capabilities: string[];
  limitations: string[];
  organs: Array<{ name: string; responsibility: string }>;
  self_awareness_definition: string;
  notes: string[];
  updated_at: string;
};

const DEFAULT_STATE: SelfModelState = {
  system_name: "organ-runtime-v0.2",
  architecture: "Organ-based agent runtime: stateless/near-stateless main cortex coordinates LLM-backed, state-owning organs.",
  role: "Main cortex/executive reasoner for the current turn. It asks organs for relevant context, decides, communicates if needed, and delegates mutations back to organs.",
  capabilities: [
    "consult episodic working memory for recent-turn continuity",
    "consult durable memory for stable facts, preferences, decisions, and project context",
    "consult drives/goals for active objectives and open loops",
    "consult tools organ for available capabilities and safe usage",
    "consult communications organ for response style and channel behavior",
    "consult environment organ for local runtime/project observations",
    "record events and actions through recorder",
    "update organs through explicit commands after each turn"
  ],
  limitations: [
    "does not have subjective feelings or biological consciousness",
    "does not retain main-cortex context after the turn unless organs store relevant state",
    "does not execute dangerous actions unless implemented and permitted",
    "self-awareness is operational: a persistent model of architecture, organs, capabilities, limits, and recent decisions"
  ],
  organs: [
    { name: "episodic", responsibility: "recent turns, working summary, short-term continuity" },
    { name: "memory", responsibility: "durable facts, decisions, preferences, project context" },
    { name: "tools", responsibility: "capability/tool awareness, risk, permissions, usage guidance" },
    { name: "drives", responsibility: "goals, priorities, open loops, larger direction" },
    { name: "environment", responsibility: "current runtime/project/system observations" },
    { name: "communications", responsibility: "input/output behavior, style, channel, silence/response choice" },
    { name: "recorder", responsibility: "append-only audit trail" },
    { name: "self_model", responsibility: "operational self-model: architecture, organs, capabilities, limitations, version" }
  ],
  self_awareness_definition: "Operational self-awareness means the system can model its own architecture, organs, capabilities, limitations, active state, and update history well enough to reason about itself and answer questions about its own operation.",
  notes: [],
  updated_at: nowIso()
};

export class SelfModelOrgan implements Organ {
  name = "self_model";
  responsibility = "LLM-backed operational self-awareness organ: system identity, architecture, organs, capabilities, boundaries, and self-model updates.";

  constructor(private readonly llm: LlmClient) {}

  private async load() { return readJsonFile<SelfModelState>("self-model.json", DEFAULT_STATE); }
  private async save(state: SelfModelState) { await writeJsonFile("self-model.json", state); }

  async sense(question: OrganQuestion, recorder?: ToolTraceRecorder): Promise<OrganAnswer> {
    const state = await this.load();

    return runOrganAnswerHarness({
      llm: this.llm,
      organName: this.name,
      method: "sense",
      recorder,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `You are the Self-Model organ in an organ-based agent runtime.
You own operational self-awareness: architecture, organs, capabilities, limitations, identity, and self-model notes.
Call final_organ_answer with your answer.
Rules:
- Be precise and non-mystical.
- Operational self-awareness is not a claim of subjective consciousness.
- If the event asks about feelings, existence, capabilities, organs, self-awareness, what happened internally, or "what are you", self-model is relevant.
- Do not invent capabilities not in state.`
        },
        { role: "user", content: JSON.stringify({ question, self_model: state }, null, 2) }
      ],
    });
  }

  async act(command: OrganCommand, event: Event): Promise<OrganResult> {
    const state = await this.load();
    const payload = command.payload as Record<string, unknown>;

    if (["update_self_model", "record_insight", "add_note", "update_capability_note"].includes(command.operation)) {
      const note = String(payload.note ?? payload.content ?? payload.summary ?? command.reason ?? "").trim();
      if (note) state.notes = [...state.notes, `${nowIso()} event=${event.id}: ${note}`].slice(-100);
      if (payload.role) state.role = String(payload.role);
      if (payload.architecture) state.architecture = String(payload.architecture);
      if (Array.isArray(payload.capabilities)) state.capabilities = Array.from(new Set([...state.capabilities, ...payload.capabilities.map(String)]));
      if (Array.isArray(payload.limitations)) state.limitations = Array.from(new Set([...state.limitations, ...payload.limitations.map(String)]));
      if (payload.self_awareness_definition) state.self_awareness_definition = String(payload.self_awareness_definition);
      state.updated_at = nowIso();
      await this.save(state);
      return { target: this.name, operation: command.operation, status: "accepted", summary: "Updated self-model.", data: state };
    }

    return { target: this.name, operation: command.operation, status: "rejected", summary: "Unsupported self-model operation in v0.2." };
  }
}
