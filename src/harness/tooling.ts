import type { LlmTool } from "../llm";
import type { CortexStepOutput, MainCortexOutput, OrganAnswer, OrganCommand } from "../schemas";

export type RuntimeTool<Args = unknown, Result = unknown> = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  validate(args: unknown): Args;
  execute(args: Args): Promise<Result>;
};

export type ToolExecutionResult = {
  ok: boolean;
  tool: string;
  result?: unknown;
  error?: string;
};

export type ToolTraceRecorder = {
  record(kind: ModelTraceKind, payload: ModelTracePayload): Promise<void>;
};

export type ModelTraceKind =
  | "model_call_started"
  | "model_call_finished"
  | "model_tool_calls"
  | "model_tool_result"
  | "model_protocol_error";

export type ModelTracePayload = {
  role: "cortex" | "organ";
  organ?: string;
  method: string;
  step?: number;
  model?: string;
  finish_reason?: string | null;
  native_finish_reason?: string | null;
  tool_call_names?: string[];
  usage?: unknown;
  validation_error?: string;
  tool?: string;
  ok?: boolean;
  error?: string;
};

export type OrganQuestionOutput = {
  questions: Array<{
    target: string;
    question: string;
    constraints?: string[];
  }>;
};

export function toLlmTool(tool: RuntimeTool): LlmTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

export function makeFinalTool(name: string, description: string, parameters: Record<string, unknown>): RuntimeTool {
  return {
    name,
    description,
    parameters,
    validate: (args) => args,
    execute: async () => ({ ok: true }),
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJsonArgs(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed) as unknown;
}

export function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

export function optionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${label} must be an array when provided.`);
  return value.map((item) => String(item));
}

export function validateOrganQuestionOutput(args: unknown): OrganQuestionOutput {
  const obj = requireRecord(args, "organ question output");
  if (!Array.isArray(obj.questions)) throw new Error("questions must be an array.");

  return {
    questions: obj.questions.map((item, index) => {
      const question = requireRecord(item, `questions[${index}]`);
      return {
        target: requireString(question.target, `questions[${index}].target`),
        question: requireString(question.question, `questions[${index}].question`),
        constraints: optionalStringArray(question.constraints, `questions[${index}].constraints`),
      };
    }),
  };
}

export function validateMainCortexOutput(args: unknown): MainCortexOutput {
  const obj = requireRecord(args, "cortex output");
  const output: MainCortexOutput = {
    organCommands: validateOrganCommands(obj.organCommands ?? []),
  };

  if (obj.userResponse !== undefined) output.userResponse = String(obj.userResponse);
  if (obj.uncertainty !== undefined) {
    const uncertainty = requireRecord(obj.uncertainty, "uncertainty");
    const level = requireString(uncertainty.level, "uncertainty.level");
    if (!["low", "medium", "high"].includes(level)) throw new Error("uncertainty.level must be low, medium, or high.");
    output.uncertainty = {
      level: level as "low" | "medium" | "high",
      reason: requireString(uncertainty.reason, "uncertainty.reason"),
    };
  }

  return output;
}

export function validateCortexStepOutput(args: unknown, canContinue: boolean, requireUserResponse = false): CortexStepOutput {
  const obj = requireRecord(args, "cortex step output");
  const decision = requireString(obj.decision, "decision");

  if (decision === "continue") {
    if (!canContinue) throw new Error("decision cannot be continue when canContinue=false.");
    const questions = validateOrganQuestionOutput({ questions: obj.questions ?? [] }).questions;
    if (questions.length === 0) throw new Error("decision=continue requires at least one question.");
    return {
      type: "continue",
      reason: requireString(obj.reason, "reason"),
      questions,
    };
  }

  if (decision === "final") {
    const output = validateMainCortexOutput({
      userResponse: obj.userResponse,
      organCommands: obj.organCommands ?? [],
      uncertainty: obj.uncertainty,
    });
    if (requireUserResponse && !output.userResponse?.trim()) throw new Error("decision=final requires a non-empty userResponse for user_message events.");
    return {
      ...output,
      type: "final",
    };
  }

  throw new Error("decision must be continue or final.");
}

export function validateOrganCommands(value: unknown): OrganCommand[] {
  if (!Array.isArray(value)) throw new Error("organCommands must be an array.");

  return value.map((item, index) => {
    const command = requireRecord(item, `organCommands[${index}]`);
    return {
      target: requireString(command.target, `organCommands[${index}].target`),
      operation: requireString(command.operation, `organCommands[${index}].operation`),
      payload: command.payload ?? {},
      reason: command.reason === undefined ? undefined : String(command.reason),
    };
  });
}

export function normalizeOrganAnswer(args: unknown, fallbackOrgan: string): OrganAnswer {
  const warnings: string[] = [];
  if (!isRecord(args)) {
    return {
      organ: fallbackOrgan,
      relevant: false,
      confidence: 0,
      summary: "Protocol warning: organ answer was not an object.",
      evidence: [],
      recommendedActions: [],
      warnings: ["Organ answer final tool arguments were not an object."],
    };
  }

  let organ = typeof args.organ === "string" && args.organ.trim() ? args.organ : fallbackOrgan;
  if (organ === fallbackOrgan && args.organ !== fallbackOrgan) warnings.push(`Missing or invalid organ; filled '${fallbackOrgan}'.`);
  if (organ !== fallbackOrgan) {
    warnings.push(`Organ '${organ}' did not match target; filled '${fallbackOrgan}'.`);
    organ = fallbackOrgan;
  }

  const relevant = typeof args.relevant === "boolean" ? args.relevant : false;
  if (typeof args.relevant !== "boolean") warnings.push("Missing or invalid relevant; defaulted to false.");

  let confidence = typeof args.confidence === "number" && Number.isFinite(args.confidence) ? args.confidence : 0;
  if (typeof args.confidence !== "number" || !Number.isFinite(args.confidence)) warnings.push("Missing or invalid confidence; defaulted to 0.");
  if (confidence < 0 || confidence > 1) {
    warnings.push("Confidence outside 0..1; clamped.");
    confidence = Math.min(1, Math.max(0, confidence));
  }

  const summary = typeof args.summary === "string" && args.summary.trim()
    ? args.summary
    : "Protocol warning: organ answer omitted a summary.";
  if (summary.startsWith("Protocol warning:")) warnings.push("Missing or invalid summary.");

  const evidence = normalizeUnknownArray(args.evidence, "evidence", warnings);
  const recommendedActions = normalizeStringArray(args.recommendedActions, "recommendedActions", warnings);
  const outputWarnings = [...normalizeStringArray(args.warnings, "warnings", warnings), ...warnings];

  return {
    organ,
    relevant,
    confidence,
    summary,
    evidence,
    recommendedActions,
    warnings: outputWarnings.length ? outputWarnings : undefined,
  };
}

function normalizeUnknownArray(value: unknown, label: string, warnings: string[]): unknown[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value;
  warnings.push(`${label} was not an array; wrapped as one item.`);
  return [value];
}

function normalizeStringArray(value: unknown, label: string, warnings: string[]): string[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    warnings.push(`${label} was a string; wrapped as one item.`);
    return [value];
  }
  warnings.push(`${label} was not an array; ignored.`);
  return [];
}
