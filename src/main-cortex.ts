import type { Event, MainCortexOutput, OrganAnswer, OrganInfo, OrganQuestion } from "./schemas";
import { LlmClient } from "./llm";

export class MainCortex {
  constructor(private readonly llm: LlmClient) {}

  async planOrganQuestions(event: Event, organs: OrganInfo[]): Promise<OrganQuestion[]> {
    const result = await this.llm.chatJson<{ questions: Array<{ target: string; question: string; constraints?: string[] }> }>([
      {
        role: "system",
        content: `You are the Main Cortex in an organ-based agent runtime.
Your job now is only to decide which organs to consult and what to ask them.
Return only valid JSON:
{
  "questions": [
    {"target":"organ_name","question":"specific question for that organ","constraints":["..."]}
  ]
}
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
    ], { temperature: 0.1 });

    return result.questions.map((q) => ({ ...q, event }));
  }

  async decide(event: Event, organAnswers: OrganAnswer[]): Promise<MainCortexOutput> {
    return this.llm.chatJson<MainCortexOutput>([
      {
        role: "system",
        content: `You are the Main Cortex in an organ-based agent runtime.
You receive compact signals from specialist LLM organs. Decide what to say to the user, if anything, and what commands to send back to organs.
Return only valid JSON matching:
{
 "userResponse":"optional response text; omit or empty for silence",
 "organCommands":[{"target":"self_model|episodic|memory|tools|drives|environment|communications|recorder","operation":"...","payload":{},"reason":"..."}],
 "uncertainty":{"level":"low|medium|high","reason":"..."}
}
Rules:
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
- If the event is internal/system and communication is unnecessary, omit userResponse but still command recorder/organs as needed.`,
      },
      { role: "user", content: JSON.stringify({ event, organAnswers }, null, 2) },
    ], { temperature: 0.2 });
  }
}
