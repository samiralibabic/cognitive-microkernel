import type { Event, Organ, OrganAnswer, OrganCommand, OrganQuestion, OrganResult } from "../schemas";
import { LlmClient } from "../llm";
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

  async sense(question: OrganQuestion): Promise<OrganAnswer> {
    const profile = await this.load();
    return {
      organ: this.name,
      relevant: true,
      confidence: 0.92,
      summary: `Communication profile: ${profile.tone}; length=${profile.default_length}; prefer=${profile.prefer.join(", ")}; avoid=${profile.avoid.join(", ")}.`,
      evidence: [profile],
      recommendedActions: question.event.type === "user_message" ? ["Respond to user unless main cortex decides no response is needed."] : ["For system events, silence is acceptable unless user attention is needed."],
    };
  }

  async renderUserResponse(event: Event, draft: string, organAnswers: OrganAnswer[]): Promise<string> {
    const profile = await this.load();

    const rendered = await this.llm.chatJson<{ response: string }>([
      {
        role: "system",
        content: `You are the Communications organ. Render the main cortex draft for the user.
Apply the communication profile without adding new facts. Preserve technical accuracy.
Return only valid JSON: {"response":"..."}`,
      },
      { role: "user", content: JSON.stringify({ event, profile, draft, organ_context: organAnswers }, null, 2) },
    ], { temperature: 0.2 });
    return rendered.response.trim();
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
