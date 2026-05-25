import { expect, test } from "bun:test";
import type { ChatMessage, ChatOptions, LlmChatResponse, LlmClient } from "../src/llm";
import type { Event, OrganAnswer } from "../src/schemas";
import { finalCortexStepTool, finalOrganAnswerTool } from "../src/harness/final-tools";
import { runToolCallingLoop } from "../src/harness/tool-loop";
import { normalizeOrganAnswer, type RuntimeTool } from "../src/harness/tooling";
import { MainCortex } from "../src/main-cortex";

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
        expect(opts?.tool_choice).toBe("auto");
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

test("cortex step exposes only final_cortex_step and requires a tool call", async () => {
  const chatCalls: Array<{ messages: ChatMessage[]; opts?: ChatOptions }> = [];
  const fakeLlm = {
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmChatResponse> {
      chatCalls.push({ messages: structuredClone(messages) as ChatMessage[], opts });
      return {
        model: "fake-cortex-model",
        choices: [{
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [toolCall("call_step", finalCortexStepTool.name, {
              decision: "continue",
              reason: "Need recent-turn context.",
              questions: [{ target: "episodic", question: "What recent context matters?" }],
            })],
          },
        }],
      };
    },
  } as unknown as LlmClient;

  const event: Event = {
    id: "evt_test",
    type: "user_message",
    content: "what does that mean?",
    timestamp: "2026-05-25T00:00:00.000Z",
    source: "test",
  };
  const cortex = new MainCortex(fakeLlm);
  const result = await cortex.stepAfterConsultation(event, [{ round: 1, questions: [], answers: [] }], true);

  expect(result.type).toBe("continue");
  expect(chatCalls).toHaveLength(1);
  expect(chatCalls[0].opts?.tools?.map((tool) => tool.function.name)).toEqual([finalCortexStepTool.name]);
  expect(chatCalls[0].opts?.tool_choice).toBe("required");
});

test("duplicate identical final tool calls are accepted as one final result", async () => {
  const chatCalls: Array<{ messages: ChatMessage[]; opts?: ChatOptions }> = [];
  const finalArgs = {
    decision: "final",
    userResponse: "Duplicate final calls were normalized.",
    organCommands: [],
    uncertainty: { level: "low", reason: "final output was complete" },
  };
  const fakeLlm = {
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmChatResponse> {
      chatCalls.push({ messages: structuredClone(messages) as ChatMessage[], opts });
      return {
        model: "fake-cortex-model",
        choices: [{
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              toolCall("call_step_1", finalCortexStepTool.name, finalArgs),
              toolCall("call_step_2", finalCortexStepTool.name, finalArgs),
            ],
          },
        }],
      };
    },
  } as unknown as LlmClient;

  const event: Event = {
    id: "evt_test",
    type: "user_message",
    content: "answer normally",
    timestamp: "2026-05-25T00:00:00.000Z",
    source: "test",
  };
  const cortex = new MainCortex(fakeLlm);
  const result = await cortex.stepAfterConsultation(event, [{ round: 1, questions: [], answers: [] }], false);

  expect(result.type).toBe("final");
  expect(result.userResponse).toBe("Duplicate final calls were normalized.");
  expect(chatCalls).toHaveLength(1);
});

test("user message final step requires userResponse", async () => {
  const chatCalls: Array<{ messages: ChatMessage[]; opts?: ChatOptions }> = [];
  const fakeLlm = {
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmChatResponse> {
      chatCalls.push({ messages: structuredClone(messages) as ChatMessage[], opts });
      const hasToolError = messages.some((message) => message.role === "tool" && message.content.includes("non-empty userResponse"));
      const finalArgs = hasToolError
        ? {
          decision: "final",
          userResponse: "The answer is now visible to the user.",
          organCommands: [],
          uncertainty: { level: "low", reason: "userResponse present" },
        }
        : {
          decision: "final",
          organCommands: [{ target: "recorder", operation: "record_turn", payload: { content: "Hidden answer" } }],
          uncertainty: { level: "low", reason: "answer was misplaced" },
        };
      return {
        model: "fake-cortex-model",
        choices: [{
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [toolCall(hasToolError ? "call_step_fixed" : "call_step_missing_response", finalCortexStepTool.name, finalArgs)],
          },
        }],
      };
    },
  } as unknown as LlmClient;

  const event: Event = {
    id: "evt_test",
    type: "user_message",
    content: "answer visibly",
    timestamp: "2026-05-25T00:00:00.000Z",
    source: "test",
  };
  const cortex = new MainCortex(fakeLlm);
  const result = await cortex.stepAfterConsultation(event, [{ round: 1, questions: [], answers: [] }], false);

  expect(result.type).toBe("final");
  expect(result.userResponse).toBe("The answer is now visible to the user.");
  expect(chatCalls).toHaveLength(2);
});

test("missing tool calls fail closed without an extra retry", async () => {
  let callCount = 0;
  const fakeLlm = {
    async chat(_messages: ChatMessage[], opts?: ChatOptions): Promise<LlmChatResponse> {
      callCount += 1;
      expect(opts?.tool_choice).toBe("required");
      return {
        model: "fake-missing-tool-model",
        choices: [{
          finish_reason: "stop",
          message: { role: "assistant", content: "Plain prose instead of a tool call." },
        }],
      };
    },
  } as unknown as LlmClient;

  await expect(runToolCallingLoop<OrganAnswer>({
    llm: fakeLlm,
    messages: [
      { role: "system", content: "Call final_organ_answer." },
      { role: "user", content: "Answer." },
    ],
    tools: [finalOrganAnswerTool],
    finalToolNames: [finalOrganAnswerTool.name],
    parseFinal: (_toolName, finalArgs) => normalizeOrganAnswer(finalArgs, "recorder"),
    maxSteps: 3,
    role: "organ",
    organ: "recorder",
    method: "sense",
  })).rejects.toThrow("without a final tool call");
  expect(callCount).toBe(1);
});
