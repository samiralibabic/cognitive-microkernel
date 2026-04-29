import { extractJson } from "./json";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmConfig = {
  mock: boolean;
  baseUrl: string;
  apiKey?: string;
  model: string;
};

export function loadLlmConfig(mock: boolean): LlmConfig {
  return {
    mock,
    baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL || "gpt-4.1-mini",
  };
}

export class LlmClient {
  constructor(private readonly config: LlmConfig) {}

  isMock() {
    return this.config.mock;
  }

  async chatText(messages: ChatMessage[], opts?: { temperature?: number }): Promise<string> {
    if (this.config.mock) {
      return "MOCK_LLM_RESPONSE";
    }
    if (!this.config.apiKey) {
      throw new Error("LLM_API_KEY is missing. Use --mock for local dry-run mode, or set LLM_API_KEY / LLM_BASE_URL / LLM_MODEL.");
    }

    const res = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: opts?.temperature ?? 0.2,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LLM request failed: ${res.status} ${res.statusText}\n${body}`);
    }

    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM response did not contain message content.");
    return content;
  }

  async chatJson<T>(messages: ChatMessage[], opts?: { temperature?: number }): Promise<T> {
    const text = await this.chatText(messages, opts);
    return extractJson<T>(text);
  }
}
