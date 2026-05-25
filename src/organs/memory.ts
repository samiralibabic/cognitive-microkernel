import type { Event, Organ, OrganAnswer, OrganCommand, OrganQuestion, OrganResult } from "../schemas";
import { LlmClient } from "../llm";
import { runOrganAnswerHarness } from "../harness/organ-answer";
import type { ToolTraceRecorder } from "../harness/tooling";
import { makeId, nowIso, readJsonFile, writeJsonFile } from "../state";
import { topMatches } from "../search";

export type MemoryRecord = {
  id: string;
  type: string;
  content: string;
  summary: string;
  tags: string[];
  confidence: number;
  status?: "active" | "inactive" | "deleted";
  source?: string;
  created_at: string;
  updated_at: string;
};

const DEFAULT_MEMORIES: MemoryRecord[] = [];

export class MemoryOrgan implements Organ {
  name = "memory";
  responsibility = "LLM-backed durable memory: facts, decisions, preferences, project context, relevance judgment, decay/update decisions.";

  constructor(private readonly llm: LlmClient) {}

  private async load() {
    return readJsonFile<MemoryRecord[]>("memory.json", DEFAULT_MEMORIES);
  }

  private async save(records: MemoryRecord[]) {
    await writeJsonFile("memory.json", records);
  }

  async sense(question: OrganQuestion, recorder?: ToolTraceRecorder): Promise<OrganAnswer> {
    const records = (await this.load()).filter((r) => (r.status ?? "active") === "active");
    const candidates = topMatches(
      `${question.event.content}\n${question.question}`,
      records,
      (m) => `${m.type} ${m.summary} ${m.content} ${m.tags.join(" ")}`,
      12,
    );

    return runOrganAnswerHarness({
      llm: this.llm,
      organName: this.name,
      method: "sense",
      recorder,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `You are the Memory organ in an organ-based agent runtime. You own durable memory.
Call final_organ_answer with your answer.
Rules:
- Use only candidate memories as evidence.
- Return relevant=false if no durable memory actually helps.
- Do not return raw short-term transcript; episodic owns recent continuity.
- Do not over-activate test-only memories.
- Evidence may contain internal IDs for the cortex, but the cortex must not expose them to users unless debugging is explicitly requested.`,
        },
        {
          role: "user",
          content: JSON.stringify({ question, candidate_memories: candidates }, null, 2),
        },
      ],
    });
  }

  async act(command: OrganCommand, event: Event): Promise<OrganResult> {
    const records = await this.load();
    const payload = command.payload as Record<string, unknown>;

    if (["delete", "forget", "remove", "remove_matching", "deactivate", "deactivate_matching", "mark_inactive"].includes(command.operation)) {
      const query = String(payload.query ?? payload.content ?? payload.summary ?? event.content ?? "");
      const matches = topMatches(
        query,
        records.filter((r) => (r.status ?? "active") === "active"),
        (m) => `${m.type} ${m.summary} ${m.content} ${m.tags.join(" ")}`,
        10,
      );
      const threshold = command.operation.includes("matching") ? 0.05 : 0;
      const ids = new Set(matches.filter((m) => m._score >= threshold).map((m) => m.id));
      let count = 0;
      for (const record of records) {
        if (ids.has(record.id)) {
          record.status = "inactive";
          record.updated_at = nowIso();
          count += 1;
        }
      }
      await this.save(records);
      return {
        target: this.name,
        operation: command.operation,
        status: "accepted",
        summary: count ? `Deactivated ${count} matching durable memor${count === 1 ? "y" : "ies"}.` : "No matching active durable memory found to deactivate.",
        data: { deactivated_count: count },
      };
    }

    const decision = await this.llm.chatJson<{
      status: "accepted" | "rejected";
      action: "append" | "update_existing" | "ignore" | "deactivate_existing";
      record?: Partial<MemoryRecord>;
      existing_id?: string;
      summary: string;
    }>([
      {
        role: "system",
        content: `You are the Memory organ. Decide how to handle a mutation command from the main cortex.
You may append a new memory, update an existing memory, deactivate an existing memory, or ignore weak/test-only data.
Return only valid JSON:
{
  "status":"accepted"|"rejected",
  "action":"append"|"update_existing"|"ignore"|"deactivate_existing",
  "existing_id":"optional id",
  "record": {"type":"...","content":"...","summary":"...","tags":[...],"confidence":0-1},
  "summary":"what you decided"
}
Rules:
- Do not store trivial one-off data unless useful across future turns.
- If the user says something was a test, stress test, verification, or messing with the system, ignore or deactivate related durable memory.
- Mark inferred preferences lower confidence than explicit user statements.
- Prefer updating/deactivating existing records over duplicates.
- Do not use internal record IDs in user-facing language; they are for organ/cortex internals only.`,
      },
      {
        role: "user",
        content: JSON.stringify({ event, command, existing_memories: records.slice(-80) }, null, 2),
      },
    ], { temperature: 0.1 });

    if (decision.status !== "accepted" || decision.action === "ignore") {
      return { target: this.name, operation: command.operation, status: decision.status, summary: decision.summary };
    }

    if ((decision.action === "update_existing" || decision.action === "deactivate_existing") && decision.existing_id) {
      const idx = records.findIndex((m) => m.id === decision.existing_id);
      if (idx >= 0) {
        if (decision.action === "deactivate_existing") {
          records[idx].status = "inactive";
          records[idx].updated_at = nowIso();
        } else {
          records[idx] = {
            ...records[idx],
            ...decision.record,
            tags: decision.record?.tags ?? records[idx].tags,
            status: decision.record?.status ?? records[idx].status ?? "active",
            updated_at: nowIso(),
          } as MemoryRecord;
        }
        await this.save(records);
        return { target: this.name, operation: command.operation, status: "accepted", summary: decision.summary, data: { id: decision.existing_id, status: records[idx].status ?? "active" } };
      }
    }

    const r = decision.record ?? {};
    const content = String(r.content ?? JSON.stringify(command.payload));
    const record: MemoryRecord = {
      id: makeId("mem"),
      type: String(r.type ?? "note"),
      content,
      summary: String(r.summary ?? r.content ?? JSON.stringify(command.payload)).slice(0, 500),
      tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
      confidence: typeof r.confidence === "number" ? r.confidence : 0.7,
      status: r.status ?? "active",
      source: event.id,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    records.push(record);
    await this.save(records);
    return { target: this.name, operation: command.operation, status: "accepted", summary: decision.summary, data: { id: record.id } };
  }
}
