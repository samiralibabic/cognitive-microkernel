import type { Event, Organ, OrganAnswer, OrganCommand, OrganQuestion, OrganResult } from "../schemas";
import { LlmClient } from "../llm";
import { runOrganAnswerHarness } from "../harness/organ-answer";
import type { ToolTraceRecorder } from "../harness/tooling";
import { nowIso, readJsonFile, writeJsonFile } from "../state";
import { topMatches } from "../search";

export type ToolCapability = {
  capability: string;
  status: CapabilityStatus;
  description: string;
  use_when: string[];
  risk: "low" | "medium" | "high";
  requires_permission: boolean;
  adapter?: string;
  notes?: string;
};

export type CapabilityStatus = "implemented" | "registered_not_executable" | "planned" | "deprecated";

const DEFAULT_TOOLS: ToolCapability[] = [
  {
    capability: "llm_chat_completion",
    status: "implemented",
    description: "Call an OpenAI-compatible chat completion model.",
    use_when: ["organ cognition", "main cortex cognition", "summarization", "relevance judgment"],
    risk: "low",
    requires_permission: false,
    adapter: "src/llm.ts",
  },
  {
    capability: "json_state_store",
    status: "implemented",
    description: "Read/write small durable JSON state files under ./state.",
    use_when: ["memory", "goals", "communication profile", "tool registry"],
    risk: "low",
    requires_permission: false,
  },
  {
    capability: "append_only_jsonl_log",
    status: "implemented",
    description: "Append audit events and action records to JSONL logs.",
    use_when: ["recorder", "debugging", "replay"],
    risk: "low",
    requires_permission: false,
  },
  {
    capability: "shell_exec",
    status: "registered_not_executable",
    description: "Run local shell commands. Not implemented in v0 dispatcher; registry only.",
    use_when: ["repo inspection", "tests", "builds", "local automation"],
    risk: "high",
    requires_permission: true,
  },
  {
    capability: "mcp_adapter",
    status: "planned",
    description: "Future adapter layer for Model Context Protocol servers.",
    use_when: ["external tools", "connected resources", "standardized tool servers"],
    risk: "medium",
    requires_permission: true,
    notes: "Not used in v0 core loop.",
  }
];

export class ToolsOrgan implements Organ {
  name = "tools";
  responsibility = "LLM-backed capability broker: knows available tools, maps intent to capabilities, explains safe use and permissions.";

  constructor(private readonly llm: LlmClient) {}

  private async load() { return (await readJsonFile<ToolCapability[]>("tool-registry.json", DEFAULT_TOOLS)).map(normalizeCapability); }
  private async save(tools: ToolCapability[]) { await writeJsonFile("tool-registry.json", tools); }

  async sense(question: OrganQuestion, recorder?: ToolTraceRecorder): Promise<OrganAnswer> {
    const tools = await this.load();
    const candidates = topMatches(
      `${question.event.content}\n${question.question}`,
      tools,
      (t) => `${t.capability} ${t.status} ${t.description} ${t.use_when.join(" ")} ${t.notes ?? ""}`,
      10,
    );

    return runOrganAnswerHarness({
      llm: this.llm,
      organName: this.name,
      method: "sense",
      recorder,
      messages: [
        {
          role: "system",
          content: `You are the Tools organ. You own capability/tool awareness. Hide tool explosion from the main cortex.
Call final_organ_answer with your answer. Recommend relevant capabilities and safe usage. Warn about permission/risk. Use only listed capabilities.
Rules:
- Treat status=implemented as currently available.
- Treat status=registered_not_executable as known but not executable by this runtime.
- Treat status=planned as future capability, not current capability.
- Never describe planned or registered_not_executable capabilities as implemented.`,
        },
        { role: "user", content: JSON.stringify({ question, candidate_capabilities: candidates, registry_size: tools.length }, null, 2) },
      ],
    });
  }

  async act(command: OrganCommand, event: Event): Promise<OrganResult> {
    const tools = await this.load();
    const payload = command.payload as Record<string, unknown>;

    if (["register_capability", "update_capability"].includes(command.operation)) {
      const cap = String(payload.capability ?? "");
      if (!cap) return { target: this.name, operation: command.operation, status: "rejected", summary: "Missing capability name." };
      const existing = tools.find((t) => t.capability === cap);
      if (existing) {
        Object.assign(existing, payload, { notes: String(payload.notes ?? existing.notes ?? `Updated from event ${event.id} at ${nowIso()}`) });
        existing.status = normalizeCapabilityStatus(existing.status, defaultStatusFor(existing.capability));
      } else {
        tools.push({
          capability: cap,
          status: normalizeCapabilityStatus(payload.status, "registered_not_executable"),
          description: String(payload.description ?? cap),
          use_when: Array.isArray(payload.use_when) ? payload.use_when.map(String) : [],
          risk: ["low", "medium", "high"].includes(String(payload.risk)) ? payload.risk as ToolCapability["risk"] : "medium",
          requires_permission: Boolean(payload.requires_permission),
          adapter: payload.adapter ? String(payload.adapter) : undefined,
          notes: payload.notes ? String(payload.notes) : undefined,
        });
      }
      await this.save(tools);
      return { target: this.name, operation: command.operation, status: "accepted", summary: `Capability ${cap} registered/updated.` };
    }

    return { target: this.name, operation: command.operation, status: "rejected", summary: "Tools organ v0 only mutates capability registry. Tool execution is intentionally not implemented yet." };
  }
}

function normalizeCapability(capability: ToolCapability): ToolCapability {
  return {
    ...capability,
    status: normalizeCapabilityStatus(capability.status, defaultStatusFor(capability.capability)),
  };
}

function normalizeCapabilityStatus(value: unknown, fallback: CapabilityStatus): CapabilityStatus {
  return ["implemented", "registered_not_executable", "planned", "deprecated"].includes(String(value))
    ? value as CapabilityStatus
    : fallback;
}

function defaultStatusFor(capability: string): CapabilityStatus {
  if (["llm_chat_completion", "json_state_store", "append_only_jsonl_log"].includes(capability)) return "implemented";
  if (capability === "mcp_adapter") return "planned";
  return "registered_not_executable";
}
