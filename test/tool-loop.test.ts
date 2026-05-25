import { expect, test } from "bun:test";
import type { ChatMessage, ChatOptions, LlmChatResponse, LlmClient } from "../src/llm";
import type { OrganAnswer } from "../src/schemas";
import { finalOrganAnswerTool } from "../src/harness/final-tools";
import { runToolCallingLoop } from "../src/harness/tool-loop";
import { normalizeOrganAnswer, type RuntimeTool } from "../src/harness/tooling";

function toolCall(id: string, name: string, args: unknown) {
  return {
    id,
    type: "function" as const,
    function: { name, arguments: JSON.stringify(args) },
  };
}

test("tool loop observes recorder tool output before accepting final answer", async () => {
  let queryCount = 0;
  const queryAuditLog: RuntimeTool<Record<string, never>, { summary: string; evidence: unknown[]; warnings: string[] }> = {
    name: "query_audit_log",
    description: "Read recorder audit logs.",
    parameters: { type: "object", additionalProperties: false, properties: {} },
    validate: () => ({}),
    execute: async () => {
      queryCount += 1;
      return {
        summary: "Recorder audit log contains timestamped local records.",
        evidence: [{ timestamp: "2026-05-25T00:00:00.000Z", kind: "event_received" }],
        warnings: [],
      };
    },
  };

  const chatCalls: Array<{ messages: ChatMessage[]; opts?: ChatOptions }> = [];
  const fakeLlm = {
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmChatResponse> {
      chatCalls.push({ messages: structuredClone(messages) as ChatMessage[], opts });

      if (chatCalls.length === 1) {
        expect(opts?.tool_choice).toBe("required");
        expect(opts?.parallel_tool_calls).toBe(false);
        return {
          model: "fake-recorder-model",
          choices: [{
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                toolCall("call_query", "query_audit_log", {}),
                toolCall("call_final_early", "final_organ_answer", {
                  organ: "recorder",
                  relevant: true,
                  confidence: 1,
                  summary: "Unsupported early final answer.",
                }),
              ],
            },
          }],
        };
      }

      expect(chatCalls).toHaveLength(2);
      expect(messages.some((message) => message.role === "tool" && message.name === "query_audit_log" && message.content.includes("timestamped local records"))).toBe(true);
      expect(messages.some((message) => message.role === "tool" && message.name === "final_organ_answer" && message.content.includes("Premature final tool call ignored"))).toBe(true);

      return {
        model: "fake-recorder-model",
        choices: [{
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [toolCall("call_final_after_observation", "final_organ_answer", {
              organ: "recorder",
              relevant: true,
              confidence: 0.9,
              summary: "Audit log result says local records are timestamped.",
              evidence: [{ source: "query_audit_log" }],
            })],
          },
        }],
      };
    },
  } as unknown as LlmClient;

  const result = await runToolCallingLoop<OrganAnswer>({
    llm: fakeLlm,
    messages: [
      {
        role: "system",
        content: "You are the Recorder organ. Call query_audit_log before final_organ_answer for timestamp/storage claims.",
      },
      { role: "user", content: "Was this recorded with timestamps, and was it stored?" },
    ],
    tools: [queryAuditLog, finalOrganAnswerTool],
    finalToolNames: [finalOrganAnswerTool.name],
    parseFinal: (_toolName, finalArgs) => normalizeOrganAnswer(finalArgs, "recorder"),
    maxSteps: 3,
    temperature: 0.1,
    role: "organ",
    organ: "recorder",
    method: "sense",
  });

  expect(queryCount).toBe(1);
  expect(result.final.summary).toContain("timestamped");

  const queryResultIndex = result.trace.findIndex((item) => item.kind === "model_tool_result" && item.tool === "query_audit_log" && item.ok === true);
  const acceptedFinalIndex = result.trace.findIndex((item) => item.kind === "model_tool_calls" && item.step === 2 && item.tool_call_names?.includes("final_organ_answer"));
  const prematureFinalIndex = result.trace.findIndex((item) => item.kind === "model_protocol_error" && item.validation_error?.includes("premature final tool call"));

  expect(queryResultIndex).toBeGreaterThanOrEqual(0);
  expect(acceptedFinalIndex).toBeGreaterThan(queryResultIndex);
  expect(prematureFinalIndex).toBeGreaterThanOrEqual(0);
});
