import type { Event, OrganAnswer, OrganCommand, OrganQuestion, OrganResult } from "./schemas";
import { LlmClient, loadLlmConfig } from "./llm";
import { MainCortex } from "./main-cortex";
import { createOrgans, organInfos } from "./registry";
import { makeId, nowIso } from "./state";

export type RunOptions = {
  mock: boolean;
  verbose: boolean;
  source?: string;
  type?: Event["type"];
};

export type RunTurnResult = {
  event: Event;
  questions: OrganQuestion[];
  answers: OrganAnswer[];
  cortexOutput: {
    userResponse?: string;
    organCommands: OrganCommand[];
    uncertainty?: { level: "low" | "medium" | "high"; reason: string };
  };
  renderedResponse?: string;
  commandResults: OrganResult[];
};

export async function runTurn(content: string, options: RunOptions): Promise<RunTurnResult> {
  const llm = new LlmClient(loadLlmConfig(options.mock));
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

  const questions = await cortex.planOrganQuestions(event, organInfos(registry));
  await recorder.record("organ_questions_planned", event, questions);

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
    const answer = await organ.sense(q);
    answers.push(answer);
  }
  await recorder.record("organ_answers", event, answers);

  const cortexOutput = await cortex.decide(event, answers);
  await recorder.record("cortex_output", event, cortexOutput);

  let renderedResponse: string | undefined;
  if (cortexOutput.userResponse?.trim()) {
    renderedResponse = await communications.renderUserResponse(event, cortexOutput.userResponse, answers);
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

  return { event, questions, answers, cortexOutput: effectiveCortexOutput, renderedResponse, commandResults };
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
