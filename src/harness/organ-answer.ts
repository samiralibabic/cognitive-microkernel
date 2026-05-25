import type { ChatMessage, LlmClient } from "../llm";
import type { OrganAnswer } from "../schemas";
import { finalOrganAnswerTool } from "./final-tools";
import { runToolCallingLoop, ToolProtocolError } from "./tool-loop";
import { normalizeOrganAnswer, type RuntimeTool, type ToolTraceRecorder } from "./tooling";

export async function runOrganAnswerHarness(args: {
  llm: LlmClient;
  organName: string;
  method: string;
  messages: ChatMessage[];
  tools?: RuntimeTool[];
  temperature?: number;
  maxSteps?: number;
  recorder?: ToolTraceRecorder;
}): Promise<OrganAnswer> {
  try {
    const result = await runToolCallingLoop<OrganAnswer>({
      llm: args.llm,
      messages: args.messages,
      tools: [...(args.tools ?? []), finalOrganAnswerTool],
      finalToolNames: [finalOrganAnswerTool.name],
      parseFinal: (_toolName, finalArgs) => normalizeOrganAnswer(finalArgs, args.organName),
      maxSteps: args.maxSteps ?? 3,
      temperature: args.temperature ?? 0.1,
      recorder: args.recorder,
      role: "organ",
      organ: args.organName,
      method: args.method,
    });
    return result.final;
  } catch (err) {
    if (!(err instanceof ToolProtocolError)) throw err;
    return normalizeOrganAnswer({
      organ: args.organName,
      relevant: false,
      confidence: 0,
      summary: "Protocol warning: organ could not produce a final tool answer.",
      warnings: [err.message],
    }, args.organName);
  }
}
