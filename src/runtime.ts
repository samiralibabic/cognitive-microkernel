import type { ConsultationRound, CortexStepOutput, Event, MainCortexOutput, Organ, OrganAnswer, OrganCommand, OrganQuestion, OrganResult } from "./schemas";
import { LlmClient, loadLlmConfig } from "./llm";
import type { ToolLoopTraceItem } from "./harness/tool-loop";
import { normalizeOrganAnswer, type ModelTraceKind, type ModelTracePayload, type ToolTraceRecorder } from "./harness/tooling";
import { MainCortex } from "./main-cortex";
import { createOrgans, organInfos } from "./registry";
import { makeId, nowIso } from "./state";

export type RunOptions = {
  verbose: boolean;
  source?: string;
  type?: Event["type"];
};

export const MAX_CONSULTATION_ROUNDS = 2;

export type RunTurnResult = {
  event: Event;
  consultationRounds: ConsultationRound[];
  questions: OrganQuestion[];
  answers: OrganAnswer[];
  modelTrace: ToolLoopTraceItem[];
  cortexOutput: MainCortexOutput;
  renderedResponse?: string;
  commandResults: OrganResult[];
};

export async function runTurn(content: string, options: RunOptions): Promise<RunTurnResult> {
  const llm = new LlmClient(loadLlmConfig());
  const { registry, recorder, communications } = createOrgans(llm);
  const cortex = new MainCortex(llm);

  const event: Event = {
    id: makeId("evt"),
    type: options.type ?? "user_message",
    content,
    timestamp: nowIso(),
    source: options.source ?? "cli",
  };

  await recorder.record("event_received", event, event);
  const modelTrace: ToolLoopTraceItem[] = [];
  const traceRecorder = makeToolTraceRecorder(recorder, event, modelTrace);

  const consultationRounds: ConsultationRound[] = [];
  let questions = await cortex.planOrganQuestions(event, organInfos(registry), traceRecorder);
  await recorder.record("organ_questions_planned", event, { round: 1, questions });

  let cortexOutput: MainCortexOutput | undefined;
  for (let round = 1; round <= MAX_CONSULTATION_ROUNDS; round += 1) {
    const answers = await askOrgans(questions, registry, traceRecorder);
    consultationRounds.push({ round, questions, answers });
    await recorder.record("organ_answers", event, { round, answers });

    const canContinue = round < MAX_CONSULTATION_ROUNDS;
    const step = await cortex.stepAfterConsultation(event, consultationRounds, canContinue, traceRecorder);
    await recorder.record("cortex_step", event, { round, canContinue, step });

    if (step.type === "continue" && canContinue && step.questions.length > 0) {
      questions = step.questions.map((q) => ({ ...q, event }));
      await recorder.record("organ_questions_planned", event, { round: round + 1, questions });
      continue;
    }

    cortexOutput = normalizeFinalOutput(step);
    await recorder.record("cortex_output", event, { round, output: cortexOutput });
    break;
  }

  cortexOutput ??= {
    userResponse: "I do not have enough consultation evidence to answer confidently.",
    organCommands: [],
    uncertainty: { level: "high", reason: "Consultation ended without a final cortex output." },
  };

  const allQuestions = consultationRounds.flatMap((round) => round.questions);
  const answers = consultationRounds.flatMap((round) => round.answers);

  let renderedResponse: string | undefined;
  if (cortexOutput.userResponse?.trim()) {
    renderedResponse = await communications.renderUserResponse(event, cortexOutput.userResponse, answers, traceRecorder);
    await recorder.record("communication_rendered", event, renderedResponse);
  }

  const organCommands = withRequiredPostTurnCommands(event, answers, cortexOutput.organCommands, renderedResponse ?? cortexOutput.userResponse);
  const effectiveCortexOutput = { ...cortexOutput, organCommands };

  const commandResults: OrganResult[] = [];
  for (const command of organCommands) {
    const organ = registry.get(command.target);
    if (!organ) {
      const result: OrganResult = {
        target: command.target,
        operation: command.operation,
        status: "failed",
        summary: `No organ registered with target '${command.target}'.`,
      };
      commandResults.push(result);
      await recorder.record("organ_command_result", event, { command, result });
      continue;
    }
    const result = await organ.act(command, event);
    commandResults.push(result);
    await recorder.record("organ_command_result", event, { command, result });
  }

  await recorder.record("turn_complete", event, {
    response_emitted: Boolean(renderedResponse),
    commands: commandResults.length,
  });

  return { event, consultationRounds, questions: allQuestions, answers, modelTrace, cortexOutput: effectiveCortexOutput, renderedResponse, commandResults };
}

async function askOrgans(questions: OrganQuestion[], registry: Map<string, Organ>, traceRecorder: ToolTraceRecorder): Promise<OrganAnswer[]> {
  const answers: OrganAnswer[] = [];

  for (const q of questions) {
    const organ = registry.get(q.target);
    if (!organ) {
      answers.push({
        organ: q.target,
        relevant: false,
        confidence: 0,
        summary: `No organ registered with target '${q.target}'.`,
        warnings: ["Unknown organ target."],
      });
      continue;
    }

    const answer = await (organ as Organ & { sense(question: OrganQuestion, recorder?: ToolTraceRecorder): Promise<OrganAnswer> }).sense(q, traceRecorder);
    answers.push(normalizeOrganAnswer(answer, q.target));
  }

  return answers;
}

function makeToolTraceRecorder(
  recorder: { record(kind: string, event: Event, payload: unknown): Promise<void> },
  event: Event,
  modelTrace: ToolLoopTraceItem[],
): ToolTraceRecorder {
  return {
    async record(kind: ModelTraceKind, payload: ModelTracePayload) {
      modelTrace.push({ kind, ...payload });
      await recorder.record(kind, event, payload);
    },
  };
}

function normalizeFinalOutput(step: CortexStepOutput): MainCortexOutput {
  if (step.type === "continue") {
    return {
      userResponse: "I do not have enough consultation evidence to answer confidently within this turn's consultation budget.",
      organCommands: [],
      uncertainty: { level: "high", reason: step.reason },
    };
  }

  const { type: _type, ...output } = step;
  return { ...output, organCommands: output.organCommands ?? [] };
}

function withRequiredPostTurnCommands(
  event: Event,
  answers: OrganAnswer[],
  commands: OrganCommand[],
  finalResponse?: string,
): OrganCommand[] {
  const out = [...commands];

  // Episodic continuity is a runtime invariant. The main cortex may request it,
  // but v0 guarantees it so follow-up prompts like "What do you mean?" work
  // even when the cortex omits the command.
  if (event.type === "user_message") {
    const hasEpisodicRecord = out.some((c) => c.target === "episodic" && ["record_turn", "append_turn", "capture_exchange"].includes(c.operation));
    const payload = {
      user_message: event.content,
      assistant_response: finalResponse ?? "",
      rendered_response: finalResponse ?? "",
      event_id: event.id,
      event_type: event.type,
      organ_answer_summaries: answers.map((a) => ({
        organ: a.organ,
        relevant: a.relevant,
        confidence: a.confidence,
        summary: a.summary,
      })),
    };

    if (!hasEpisodicRecord) {
      out.push({
        target: "episodic",
        operation: "record_turn",
        payload,
        reason: "Maintain short-term episodic continuity across cleared main-cortex contexts.",
      });
    } else {
      for (const command of out) {
        if (command.target === "episodic" && ["record_turn", "append_turn", "capture_exchange"].includes(command.operation)) {
          command.payload = { ...(typeof command.payload === "object" && command.payload !== null ? command.payload : {}), ...payload };
        }
      }
    }
  }

  return out;
}
