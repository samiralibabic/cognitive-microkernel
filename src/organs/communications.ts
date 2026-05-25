import type { Event, Organ, OrganAnswer, OrganCommand, OrganQuestion, OrganResult } from "../schemas";
import { LlmClient } from "../llm";
import { finalRenderedResponseTool } from "../harness/final-tools";
import { runOrganAnswerHarness } from "../harness/organ-answer";
import { runToolCallingLoop, ToolProtocolError } from "../harness/tool-loop";
import { validateRenderedResponse, type ToolTraceRecorder } from "../harness/tooling";
import { nowIso, readJsonFile, writeJsonFile } from "../state";

export type CommsProfile = {
  default_length: "brief" | "normal" | "detailed";
  tone: string;
  prefer: string[];
  avoid: string[];
  allow_silence_for_internal_events: boolean;
  updated_at: string;
};

const DEFAULT_PROFILE: CommsProfile = {
  default_length: "brief",
  tone: "direct, objective, concise",
  prefer: ["specific recommendations", "explicit uncertainty", "plain prose", "minimal generic branching"],
  avoid: ["fluff", "marketing tone", "unnecessary enthusiasm", "generic if/then answers when user context is sufficient"],
  allow_silence_for_internal_events: true,
  updated_at: nowIso(),
};

export class CommunicationsOrgan implements Organ {
  name = "communications";
  responsibility = "LLM-backed communication input/output organ: response style, channel constraints, whether to speak or stay silent.";

  constructor(private readonly llm: LlmClient) {}

  private async load() { return readJsonFile<CommsProfile>("comms-profile.json", DEFAULT_PROFILE); }
  private async save(profile: CommsProfile) { await writeJsonFile("comms-profile.json", profile); }

  async sense(question: OrganQuestion, recorder?: ToolTraceRecorder): Promise<OrganAnswer> {
    const profile = await this.load();
    return runOrganAnswerHarness({
      llm: this.llm,
      organName: this.name,
      method: "sense",
      recorder,
      messages: [
        {
          role: "system",
          content: `You are the Communications organ. You own response style and channel behavior.
Call final_organ_answer with the relevant communication profile and whether a response is appropriate. Do not add new facts.`,
        },
        { role: "user", content: JSON.stringify({ question, profile }, null, 2) },
      ],
    });
  }

  async renderUserResponse(event: Event, draft: string, organAnswers: OrganAnswer[], recorder?: ToolTraceRecorder): Promise<string> {
    const profile = await this.load();

    try {
      const rendered = await runToolCallingLoop({
        llm: this.llm,
        messages: [
          {
            role: "system",
            content: `You are the Communications organ. Render the main cortex draft for the user.
Call final_rendered_response with the final response text.
Apply the communication profile without adding new facts. Preserve technical accuracy.`,
          },
          { role: "user", content: JSON.stringify({ event, profile, draft, organ_context: organAnswers }, null, 2) },
        ],
        tools: [finalRenderedResponseTool],
        finalToolNames: [finalRenderedResponseTool.name],
        parseFinal: (_toolName, finalArgs) => validateRenderedResponse(finalArgs),
        maxSteps: 2,
        temperature: 0.2,
        recorder,
        role: "organ",
        organ: this.name,
        method: "renderUserResponse",
      });

      return rendered.final.response.trim();
    } catch (err) {
      if (!(err instanceof ToolProtocolError)) throw err;
      return draft.trim();
    }
  }

  async act(command: OrganCommand): Promise<OrganResult> {
    const profile = await this.load();
    const payload = command.payload as Record<string, unknown>;

    if (["update_profile", "record_style_signal", "store_preference"].includes(command.operation)) {
      if (payload.default_length && ["brief", "normal", "detailed"].includes(String(payload.default_length))) {
        profile.default_length = payload.default_length as CommsProfile["default_length"];
      }
      if (payload.tone) profile.tone = String(payload.tone);
      if (Array.isArray(payload.prefer)) profile.prefer = Array.from(new Set([...profile.prefer, ...payload.prefer.map(String)]));
      if (Array.isArray(payload.avoid)) profile.avoid = Array.from(new Set([...profile.avoid, ...payload.avoid.map(String)]));
      if (typeof payload.allow_silence_for_internal_events === "boolean") profile.allow_silence_for_internal_events = payload.allow_silence_for_internal_events;
      profile.updated_at = nowIso();
      await this.save(profile);
      return { target: this.name, operation: command.operation, status: "accepted", summary: "Updated communication profile.", data: profile };
    }

    return { target: this.name, operation: command.operation, status: "rejected", summary: "Unsupported communications mutation in v0." };
  }
}
