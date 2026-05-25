import type { ChatMessage, ChatOptions, LlmAssistantMessage, LlmClient, LlmToolCall, LlmToolMessage } from "../llm";
import { parseJsonArgs, toLlmTool, type ModelTraceKind, type ModelTracePayload, type RuntimeTool, type ToolTraceRecorder } from "./tooling";

export type ToolLoopTraceItem = ModelTracePayload & {
  kind: ModelTraceKind;
};

export class ToolProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolProtocolError";
  }
}

export async function runToolCallingLoop<TFinal>(args: {
  llm: LlmClient;
  messages: ChatMessage[];
  tools: RuntimeTool[];
  finalToolNames: string[];
  parseFinal(toolName: string, args: unknown): TFinal;
  maxSteps: number;
  temperature?: number;
  recorder?: ToolTraceRecorder;
  role: "cortex" | "organ";
  organ?: string;
  method: string;
}): Promise<{
  final: TFinal;
  trace: ToolLoopTraceItem[];
}> {
  const trace: ToolLoopTraceItem[] = [];
  const messages = [...args.messages];
  const toolByName = new Map(args.tools.map((tool) => [tool.name, tool]));
  const finalToolNames = new Set(args.finalToolNames);
  const toolChoice = defaultToolChoice(args.tools, args.finalToolNames);

  for (let step = 1; step <= args.maxSteps; step += 1) {
    await recordTrace(trace, args.recorder, "model_call_started", metadata(args, step));

    const response = await args.llm.chat(messages, {
      temperature: args.temperature,
      tools: args.tools.map(toLlmTool),
      tool_choice: toolChoice,
      parallel_tool_calls: false,
    });
    const choice = response.choices[0];
    const message = choice?.message;
    const toolCalls = message?.tool_calls ?? [];
    const toolCallNames = toolCalls.map((call) => call.function.name);

    await recordTrace(trace, args.recorder, "model_call_finished", metadata(args, step, {
      model: response.model,
      finish_reason: choice?.finish_reason ?? null,
      native_finish_reason: choice?.native_finish_reason ?? null,
      tool_call_names: toolCallNames,
      usage: response.usage,
    }));

    if (toolCalls.length === 0) {
      const reason = choice?.finish_reason ?? "missing_choice";
      await protocolError(trace, args.recorder, args, step, `Model finished with '${reason}' without a final tool call.`);
      throw new ToolProtocolError(`Model finished with '${reason}' without a final tool call.`);
    }

    await recordTrace(trace, args.recorder, "model_tool_calls", metadata(args, step, {
      tool_call_names: toolCallNames,
    }));

    const finalCalls = toolCalls.filter((call) => finalToolNames.has(call.function.name));
    const nonFinalCalls = toolCalls.filter((call) => !finalToolNames.has(call.function.name));

    if (nonFinalCalls.length === 0 && finalCalls.length > 1) {
      const error = `Expected exactly one final tool call, got ${formatToolNames(finalCalls)}.`;
      await protocolError(trace, args.recorder, args, step, error);
      messages.push(toAssistantMessage(message));

      const toolMessages: LlmToolMessage[] = [];
      for (const call of finalCalls) {
        await recordTrace(trace, args.recorder, "model_tool_result", metadata(args, step, {
          tool: call.function.name,
          ok: false,
          error,
        }));
        toolMessages.push(toolMessage(call.id, call.function.name, { ok: false, tool: call.function.name, error }));
      }
      messages.push(...toolMessages);
      continue;
    }

    if (nonFinalCalls.length === 0 && finalCalls.length === 1) {
      const finalCall = finalCalls[0];
      try {
        const finalArgs = parseJsonArgs(finalCall.function.arguments);
        return { final: args.parseFinal(finalCall.function.name, finalArgs), trace };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await protocolError(trace, args.recorder, args, step, `Invalid final tool output from ${finalCall.function.name}: ${error}`);
        messages.push(toAssistantMessage(message));
        await recordTrace(trace, args.recorder, "model_tool_result", metadata(args, step, {
          tool: finalCall.function.name,
          ok: false,
          error,
        }));
        messages.push(toolMessage(finalCall.id, finalCall.function.name, { ok: false, tool: finalCall.function.name, error }));
        continue;
      }
    }

    messages.push(toAssistantMessage(message));
    const toolMessages: LlmToolMessage[] = [];

    if (finalCalls.length > 0) {
      const error = `Ignored premature final tool call(s) ${formatToolNames(finalCalls)} because non-final tool call(s) ${formatToolNames(nonFinalCalls)} must be observed first.`;
      await protocolError(trace, args.recorder, args, step, error);
    }

    for (const call of toolCalls) {
      if (finalToolNames.has(call.function.name)) {
        const error = "Premature final tool call ignored. Tool results must be observed before finalization.";
        await recordTrace(trace, args.recorder, "model_tool_result", metadata(args, step, {
          tool: call.function.name,
          ok: false,
          error,
        }));
        toolMessages.push(toolMessage(call.id, call.function.name, { ok: false, tool: call.function.name, error }));
        continue;
      }

      const tool = toolByName.get(call.function.name);
      if (!tool) {
        const error = `Unknown tool '${call.function.name}'.`;
        await protocolError(trace, args.recorder, args, step, error, call.function.name);
        await recordTrace(trace, args.recorder, "model_tool_result", metadata(args, step, {
          tool: call.function.name,
          ok: false,
          error,
        }));
        toolMessages.push(toolMessage(call.id, call.function.name, { ok: false, tool: call.function.name, error }));
        continue;
      }

      try {
        const parsed = parseJsonArgs(call.function.arguments);
        const validated = tool.validate(parsed);
        const result = await tool.execute(validated);
        await recordTrace(trace, args.recorder, "model_tool_result", metadata(args, step, {
          tool: tool.name,
          ok: true,
        }));
        toolMessages.push(toolMessage(call.id, tool.name, { ok: true, tool: tool.name, result }));
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await recordTrace(trace, args.recorder, "model_tool_result", metadata(args, step, {
          tool: call.function.name,
          ok: false,
          error,
        }));
        toolMessages.push(toolMessage(call.id, call.function.name, { ok: false, tool: call.function.name, error }));
      }
    }

    messages.push(...toolMessages);
  }

  const error = `Model tool-call loop exceeded maxSteps=${args.maxSteps}.`;
  await protocolError(trace, args.recorder, args, args.maxSteps, error);
  throw new ToolProtocolError(error);
}

function defaultToolChoice(tools: RuntimeTool[], finalToolNames: string[]): ChatOptions["tool_choice"] {
  if (tools.length === 1 && finalToolNames.includes(tools[0].name)) {
    return { type: "function" as const, function: { name: finalToolNames[0] } };
  }
  return "auto" as const;
}

function formatToolNames(toolCalls: LlmToolCall[]): string {
  return `[${toolCalls.map((call) => call.function.name).join(", ")}]`;
}

function toAssistantMessage(message: LlmAssistantMessage | undefined): LlmAssistantMessage {
  return {
    role: "assistant",
    content: message?.content ?? null,
    tool_calls: message?.tool_calls ?? [],
  };
}

function toolMessage(tool_call_id: string, name: string, content: unknown): LlmToolMessage {
  return {
    role: "tool",
    tool_call_id,
    name,
    content: JSON.stringify(content),
  };
}

function metadata(args: { role: "cortex" | "organ"; organ?: string; method: string }, step: number, extra: Partial<ModelTracePayload> = {}): ModelTracePayload {
  return {
    role: args.role,
    organ: args.organ,
    method: args.method,
    step,
    ...extra,
  };
}

async function protocolError(
  trace: ToolLoopTraceItem[],
  recorder: ToolTraceRecorder | undefined,
  args: { role: "cortex" | "organ"; organ?: string; method: string },
  step: number,
  validation_error: string,
  tool?: string,
) {
  await recordTrace(trace, recorder, "model_protocol_error", metadata(args, step, { validation_error, tool, ok: false }));
}

async function recordTrace(
  trace: ToolLoopTraceItem[],
  recorder: ToolTraceRecorder | undefined,
  kind: ModelTraceKind,
  payload: ModelTracePayload,
) {
  trace.push({ kind, ...payload });
  await recorder?.record(kind, payload);
}
