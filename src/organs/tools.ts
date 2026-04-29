import type { Event, Organ, OrganAnswer, OrganCommand, OrganQuestion, OrganResult } from "../schemas";
import { LlmClient } from "../llm";
import { nowIso, readJsonFile, writeJsonFile } from "../state";
import { topMatches } from "../search";

export type ToolCapability = {
  capability: string;
  description: string;
  use_when: string[];
  risk: "low" | "medium" | "high";
  requires_permission: boolean;
  adapter?: string;
  notes?: string;
};

const DEFAULT_TOOLS: ToolCapability[] = [
  {
    capability: "llm_chat_completion",
    description: "Call an OpenAI-compatible chat completion model.",
    use_when: ["organ cognition", "main cortex cognition", "summarization", "relevance judgment"],
    risk: "low",
    requires_permission: false,
    adapter: "src/llm.ts",
  },
  {
    capability: "json_state_store",
    description: "Read/write small durable JSON state files under ./state.",
    use_when: ["memory", "goals", "communication profile", "tool registry"],
    risk: "low",
    requires_permission: false,
  },
  {
    capability: "append_only_jsonl_log",
    description: "Append audit events and action records to JSONL logs.",
    use_when: ["recorder", "debugging", "replay"],
    risk: "low",
    requires_permission: false,
  },
  {
    capability: "shell_exec",
    description: "Run local shell commands. Not implemented in v0 dispatcher; registry only.",
    use_when: ["repo inspection", "tests", "builds", "local automation"],
    risk: "high",
    requires_permission: true,
  },
  {
    capability: "mcp_adapter",
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

  private async load() { return readJsonFile<ToolCapability[]>("tool-registry.json", DEFAULT_TOOLS); }
  private async save(tools: ToolCapability[]) { await writeJsonFile("tool-registry.json", tools); }

  async sense(question: OrganQuestion): Promise<OrganAnswer> {
    const tools = await this.load();
    const candidates = topMatches(
      `${question.event.content}\n${question.question}`,
      tools,
      (t) => `${t.capability} ${t.description} ${t.use_when.join(" ")} ${t.notes ?? ""}`,
      10,
    );

    if (this.llm.isMock()) {
      const selected = candidates.length ? candidates : tools.slice(0, 3).map((t) => ({ ...t, _score: 0.1 }));
      return {
        organ: this.name,
        relevant: true,
        confidence: 0.75,
        summary: `Relevant capabilities: ${selected.map((t) => `${t.capability} (${t.risk} risk)`).join(", ")}.`,
        evidence: selected.map(({ _score, ...t }) => t),
        warnings: selected.filter((t) => t.requires_permission).map((t) => `${t.capability} requires permission.`),
      };
    }

    return this.llm.chatJson<OrganAnswer>([
      {
        role: "system",
        content: `You are the Tools organ. You own capability/tool awareness. Hide tool explosion from the main cortex.
Return only valid JSON matching OrganAnswer. Recommend relevant capabilities and safe usage. Warn about permission/risk. Use only listed capabilities.`,
      },
      { role: "user", content: JSON.stringify({ question, candidate_capabilities: candidates, registry_size: tools.length }, null, 2) },
    ]);
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
      } else {
        tools.push({
          capability: cap,
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
