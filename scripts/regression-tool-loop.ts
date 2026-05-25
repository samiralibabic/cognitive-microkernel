import type { ChatMessage, ChatOptions, LlmChatResponse, LlmClient } from "../src/llm";
import { finalOrganAnswerTool } from "../src/harness/final-tools";
import { runToolCallingLoop } from "../src/harness/tool-loop";
import { normalizeOrganAnswer, type RuntimeTool } from "../src/harness/tooling";
import type { OrganAnswer } from "../src/schemas";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function toolCall(id: string, name: string, args: unknown) {
  return {
    id,
    type: "function" as const,
    function: { name, arguments: JSON.stringify(args) },
  };
}

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
      assert(opts?.tool_choice === "required", "recorder harness should require tool output when runtime and final tools are both available");
      assert(opts?.parallel_tool_calls === false, "tool harness should disable parallel tool calls");
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

    assert(chatCalls.length === 2, "regression should complete in two model calls");
    assert(messages.some((message) => message.role === "tool" && message.name === "query_audit_log" && message.content.includes("timestamped local records")), "query_audit_log result was not observed before finalization");
    assert(messages.some((message) => message.role === "tool" && message.name === "final_organ_answer" && message.content.includes("Premature final tool call ignored")), "premature final_organ_answer warning was not returned to the model");

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

assert(queryCount === 1, "query_audit_log should run exactly once before finalization");
assert(result.final.summary.includes("timestamped"), "final answer should use observed audit-log result");

const queryResultIndex = result.trace.findIndex((item) => item.kind === "model_tool_result" && item.tool === "query_audit_log" && item.ok === true);
const acceptedFinalIndex = result.trace.findIndex((item) => item.kind === "model_tool_calls" && item.step === 2 && item.tool_call_names?.includes("final_organ_answer"));
const prematureFinalIndex = result.trace.findIndex((item) => item.kind === "model_protocol_error" && item.validation_error?.includes("premature final tool call"));

assert(queryResultIndex >= 0, "trace should contain query_audit_log result");
assert(acceptedFinalIndex > queryResultIndex, "final_organ_answer should only be accepted after query_audit_log result is observed");
assert(prematureFinalIndex >= 0, "trace should log premature finalization as a protocol error");

console.log("tool-loop recorder ordering regression passed");
