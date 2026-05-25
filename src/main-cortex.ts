import type { ConsultationRound, CortexStepOutput, Event, MainCortexOutput, OrganAnswer, OrganInfo, OrganQuestion } from "./schemas";
import { LlmClient } from "./llm";
import { finalCortexStepTool, finalOrganQuestionsTool } from "./harness/final-tools";
import { runToolCallingLoop, ToolProtocolError } from "./harness/tool-loop";
import { validateCortexStepOutput, validateOrganQuestionOutput, type ToolTraceRecorder } from "./harness/tooling";

export class MainCortex {
  constructor(private readonly llm: LlmClient) {}

  async planOrganQuestions(event: Event, organs: OrganInfo[], recorder?: ToolTraceRecorder): Promise<OrganQuestion[]> {
    try {
      const result = await runToolCallingLoop({
        llm: this.llm,
        messages: [
          {
            role: "system",
            content: `You are the Main Cortex in an organ-based agent runtime.
Your job now is only to decide which organs to consult and what to ask them.
Call final_organ_questions with the targeted question batch.
Rules:
- Ask targeted questions.
- Prefer consulting self_model, episodic, memory, drives, tools, communications, and recorder unless clearly irrelevant.
- self_model is relevant for questions about feelings, identity, capabilities, organs, self-awareness, architecture, internals, what happened "on your end", or how the system works.
- Episodic is relevant for recent-turn continuity, references like "what do you mean", "that/this/it", and questions about the last message.
- Memory is for durable facts/preferences/decisions, not raw short-term transcript.
- Environment is relevant for system/code/file/runtime events and sometimes for local implementation tasks.
- Recorder is relevant for questions about logs, timestamps, storage/recording, recorded history, chronological order, earliest/latest events, what happened in the system, what was logged, or failures.
- Do not answer the user yet.
- Do not ask organs to mutate state in this phase.`,
          },
          { role: "user", content: JSON.stringify({ event, available_organs: organs }, null, 2) },
        ],
        tools: [finalOrganQuestionsTool],
        finalToolNames: [finalOrganQuestionsTool.name],
        parseFinal: (_toolName, finalArgs) => validateOrganQuestionOutput(finalArgs),
        maxSteps: 2,
        temperature: 0.1,
        recorder,
        role: "cortex",
        method: "planOrganQuestions",
      });

      return result.final.questions.map((q) => ({ ...q, event }));
    } catch (err) {
      if (err instanceof ToolProtocolError) return [];
      throw err;
    }
  }

  async stepAfterConsultation(event: Event, rounds: ConsultationRound[], canContinue: boolean, recorder?: ToolTraceRecorder): Promise<CortexStepOutput> {
    try {
      const result = await runToolCallingLoop<CortexStepOutput>({
        llm: this.llm,
        messages: [
          {
            role: "system",
            content: `You are the Main Cortex in an organ-based agent runtime.
You have received one or more consultation rounds. A consultation round is one cortex-to-organ question batch followed by one organ-to-cortex answer batch.
Decide whether to finalize now or ask one more targeted consultation round.
Call final_cortex_step with decision="continue" or decision="final". Do not answer in prose.

Consultation rules:
- Cortex remains the only coordinator. Organs do not talk to each other.
- You may use organ recommendedActions as evidence, but organs do not redirect the turn; you own any continuation decision.
- If canContinue=false, you must finalize.
- Continue only if one more organ answer is likely to materially improve the response.
- Do not continue for vague curiosity.
- Do not ask broad/general follow-up questions.
- Ask only the specific organ or organs needed.
- Use a simple cortex-owned reason label. Do not frame the reason as organ redirection.
- Do not say you will check, retrieve, ask, or look something up unless you choose continue so the runtime can perform that consultation before the final answer.
- If you would need more information but cannot continue, finalize with explicit uncertainty.

Final-answer rules:
- For user_message events, decision="final" requires a non-empty userResponse. The user-facing answer belongs in userResponse; recorder or episodic commands are only state updates and are not a substitute for the reply.
- Be decisive and personalized when organ context is sufficient.
- Avoid generic if/then branching unless uncertainty is genuine and material.
- If the user asks about your own feelings, identity, existence, capabilities, organs, self-awareness, internals, or what happened "on your end", use self_model context. Do not imply subjective feelings or biological consciousness.
- If the user refers to the previous turn, last question, "what do you mean", "this", "that", or "it", use episodic organ context.
- Do not expose internal memory IDs, file names, or implementation records to the user unless the user explicitly asks for debugging internals or verbose state.
- If the user says something was a test, stress test, verification, or that they were messing with the system, treat related context as test/ephemeral. Prefer updating episodic summary or asking memory to deactivate related durable entries instead of preserving it as a durable preference.
- Do not mention active goals or architecture merely because drives returned them. Mention them only when relevant to the user request.
- Always include at least one recorder command summarizing the turn.
- For every user_message, include or expect a post-turn episodic record_turn command so the next turn can resolve recent references.
- Send post-response mutation commands when the system learned something durable, a self-model note changed, or a goal/open loop changed.
- Use episodic for short-term continuity; use memory only for durable facts/preferences/decisions.
- Do not directly mutate state; delegate to organs.
- Do not invent memory/tool/self facts not present in organ answers.
- If recorder provides audit/history evidence, use it as the source and limit claims to local runtime logs since state creation or reset. Recorder logs are stored local runtime state; distinguish them from the memory organ, but do not call them non-durable when recorder reports stored records. Do not infer that nothing happened before the earliest local log; say only that recorder has no local records before then.
- Claims about implemented runtime capability require status=implemented from tools organ or direct recorder/environment evidence. Planned or registered-only capabilities must be labeled as planned or not executable.
- If the event is internal/system and communication is unnecessary, omit userResponse but still command recorder/organs as needed.`,
          },
          { role: "user", content: JSON.stringify({ event, rounds, canContinue }, null, 2) },
        ],
        tools: [finalCortexStepTool],
        finalToolNames: [finalCortexStepTool.name],
        parseFinal: (_toolName, finalArgs) => validateCortexStepOutput(finalArgs, canContinue, event.type === "user_message"),
        maxSteps: 2,
        temperature: 0.2,
        recorder,
        role: "cortex",
        method: "stepAfterConsultation",
      });

      return result.final;
    } catch (err) {
      if (!(err instanceof ToolProtocolError)) throw err;
      return {
        type: "final",
        userResponse: "There was a structured tool-call failure in this turn. The model did not return the required tool call, so I cannot complete the normal cortex step.",
        organCommands: [],
        uncertainty: { level: "high", reason: "structured_tool_call_failure" },
      };
    }
  }

  async decide(event: Event, organAnswers: OrganAnswer[], recorder?: ToolTraceRecorder): Promise<MainCortexOutput> {
    const step = await this.stepAfterConsultation(event, [{ round: 1, questions: [], answers: organAnswers }], false, recorder);
    if (step.type === "continue") {
      return {
        userResponse: "I do not have enough consultation evidence to answer confidently.",
        organCommands: [],
        uncertainty: { level: "high", reason: step.reason },
      };
    }
    const { type: _type, ...output } = step;
    return output;
  }
}
