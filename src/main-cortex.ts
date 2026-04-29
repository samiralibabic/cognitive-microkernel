import type { Event, MainCortexOutput, OrganAnswer, OrganCommand, OrganInfo, OrganQuestion } from "./schemas";
import { LlmClient } from "./llm";

export class MainCortex {
  constructor(private readonly llm: LlmClient) {}

  async planOrganQuestions(event: Event, organs: OrganInfo[]): Promise<OrganQuestion[]> {
    if (this.llm.isMock()) {
      return organs
        .filter((o) => ["self_model", "episodic", "memory", "tools", "drives", "environment", "communications", "recorder"].includes(o.name))
        .map((o) => ({
          target: o.name,
          event,
          question: defaultQuestion(o.name),
          constraints: ["Return compact, relevant signal only.", "Do not flood the main cortex with raw state."],
        }));
    }

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
- Do not answer the user yet.
- Do not ask organs to mutate state in this phase.`,
      },
      { role: "user", content: JSON.stringify({ event, available_organs: organs }, null, 2) },
    ], { temperature: 0.1 });

    return result.questions.map((q) => ({ ...q, event }));
  }

  async decide(event: Event, organAnswers: OrganAnswer[]): Promise<MainCortexOutput> {
    if (this.llm.isMock()) {
      return this.mockDecide(event, organAnswers);
    }

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
- If the event is internal/system and communication is unnecessary, omit userResponse but still command recorder/organs as needed.`,
      },
      { role: "user", content: JSON.stringify({ event, organAnswers }, null, 2) },
    ], { temperature: 0.2 });
  }

  private mockDecide(event: Event, organAnswers: OrganAnswer[]): MainCortexOutput {
    const by = (name: string) => organAnswers.find((a) => a.organ === name)?.summary;
    const episodic = by("episodic");
    const drive = by("drives");
    const memory = by("memory");
    const tools = by("tools");
    const self = by("self_model");
    const text = event.content;
    const asksNext = /what.*next|next step|do next/i.test(text);
    const asksBuild = /build|implement|code|create/i.test(text);
    const asksContinuity = /what do you mean|what are you talking about|defined where|last question|last message|previous|earlier|what organ|what did i|explain last few turns/i.test(text);
    const asksSelf = /how are you feeling|feelings?|self[- ]?aware|self awareness|what are you|who are you|your internals|on your end|capabilit|existence/i.test(text);
    const isArchitecture = /organ|cortex|runtime|agent/i.test(text);
    const isTestCleanup = /test|stress test|verification|messing with you|remove.*agreement|not.*agreement/i.test(text);

    let userResponse = "Recorded. The organ runtime loop is operational in mock mode.";
    if (isTestCleanup) {
      userResponse = "Understood. I’ll treat that as test context, not a durable user preference or agreement.";
    } else if (asksContinuity && episodic && !episodic.includes("No recent")) {
      userResponse = [
        "Recent continuity from the episodic organ:",
        episodic,
      ].join("\n");
    } else if (asksSelf) {
      userResponse = [
        "I do not have subjective feelings. Operationally, I can report system state.",
        self ? `Self-model: ${self}` : undefined,
        episodic && !episodic.includes("No recent") ? `Recent context: ${episodic}` : undefined,
      ].filter(Boolean).join("\n");
    } else if (asksNext || asksBuild || isArchitecture) {
      userResponse = [
        "Next step: implement or inspect the contract layer first: Event, OrganQuestion, OrganAnswer, OrganCommand, OrganResult.",
        "Then run the context-clear test: one turn stores the architecture decision, the next turn answers from memory/drives/episodic instead of chat history.",
        episodic && !episodic.includes("No recent") ? `Episodic: ${episodic}` : undefined,
        drive && !drive.includes("No active") ? `Drives: ${drive}` : undefined,
        memory && !memory.includes("No stored") ? `Memory: ${memory}` : undefined,
        tools ? `Tools: ${tools}` : undefined,
      ].filter(Boolean).join("\n");
    }

    const commands: OrganCommand[] = [
      {
        target: "recorder",
        operation: "append",
        payload: { event: event.content, decision: userResponse },
        reason: "Always record turn-level decision.",
      },
    ];

    if (isTestCleanup) {
      commands.push({
        target: "memory",
        operation: "deactivate_matching",
        payload: { query: event.content, reason: "User identified related context as test/verification, not durable preference." },
        reason: "Keep test artifacts out of durable memory.",
      });
      commands.push({
        target: "episodic",
        operation: "update_summary",
        payload: { summary: "Recent interaction included a system stress test. Test cues/agreements should not be treated as durable user preferences." },
        reason: "Correct recent working summary after user clarified it was a test.",
      });
    }

    if (asksSelf || isArchitecture) {
      commands.push({
        target: "self_model",
        operation: "record_insight",
        payload: {
          note: "User is exploring operational self-awareness as a persistent model of system organs, capabilities, limitations, and current state.",
        },
        reason: "Self-model discussion should update operational self-awareness notes.",
      });
    }

    if (isArchitecture || asksBuild) {
      commands.push({
        target: "memory",
        operation: "store_or_update",
        payload: {
          type: "architecture_decision",
          content: event.content,
          summary: "User discussed/building organ-based agent runtime architecture.",
          tags: ["organ-runtime", "architecture", "main-cortex"],
          confidence: 0.8,
        },
        reason: "Architecture/build request may be relevant across future turns.",
      });
      commands.push({
        target: "drives",
        operation: "update_next_step",
        payload: {
          goal: "Build a lean organ-based agent runtime v0.",
          next_step: "Implement contract schemas and runtime loop; validate with context-clear test.",
          status: "active",
        },
        reason: "Keep active implementation goal current.",
      });
    }

    return { userResponse, organCommands: commands, uncertainty: { level: "medium", reason: "Mock cortex uses deterministic logic; use real LLM mode for organ reasoning." } };
  }
}

function defaultQuestion(name: string): string {
  switch (name) {
    case "self_model":
      return "Is this event about the system's own identity, feelings, capabilities, organs, self-awareness, architecture, internals, or what happened on your end? Return the relevant operational self-model if so.";
    case "episodic":
      return "What recent-turn context, previous user/assistant messages, or rolling working summary is relevant to this event? Pay special attention to references like what do you mean, this, that, it, previous, last message, or defined where.";
    case "memory":
      return "Do we remember anything durable and relevant to this event, including prior decisions, preferences, project context, or unresolved threads? Do not return mere recent-turn transcript; episodic owns that.";
    case "tools":
      return "What tools or capabilities are relevant for this event, and how should they be used safely?";
    case "drives":
      return "What larger goal, open loop, or active priority does this event belong to? Return not relevant if the event is casual or unrelated to goals.";
    case "environment":
      return "Is there anything in the current runtime/project environment that changes how this event should be handled?";
    case "communications":
      return "What communication style, channel, or silence/response constraint applies to this event?";
    case "recorder":
      return "What should be recorded for auditability during this turn?";
    default:
      return "Do you have anything relevant for this event?";
  }
}
