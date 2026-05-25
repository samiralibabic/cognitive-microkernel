import { extractJson } from "./json";

export type LlmTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

export type LlmToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type LlmSystemMessage = {
  role: "system";
  content: string;
};

export type LlmUserMessage = {
  role: "user";
  content: string;
};

export type LlmAssistantMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: LlmToolCall[];
};

export type LlmToolMessage = {
  role: "tool";
  tool_call_id: string;
  name?: string;
  content: string;
};

export type ChatMessage = LlmSystemMessage | LlmUserMessage | LlmAssistantMessage | LlmToolMessage;

export type LlmChatResponse = {
  id?: string;
  model?: string;
  choices: Array<{
    finish_reason: "tool_calls" | "stop" | "length" | "content_filter" | "error" | string | null;
    native_finish_reason?: string | null;
    message?: LlmAssistantMessage;
    error?: unknown;
  }>;
  usage?: unknown;
};

export type ChatOptions = {
  temperature?: number;
  tools?: LlmTool[];
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
  response_format?: unknown;
  max_tokens?: number;
};

export type LlmConfig = {
  baseUrl: string;
  apiKey?: string;
  model: string;
};

export function loadLlmConfig(): LlmConfig {
  return {
    baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL || "gpt-4.1-mini",
  };
}

export class LlmClient {
  constructor(private readonly config: LlmConfig) {}

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmChatResponse> {
    if (!this.config.apiKey) {
      throw new Error("LLM_API_KEY is missing. Set LLM_API_KEY / LLM_BASE_URL / LLM_MODEL in .env or environment variables.");
    }

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: opts?.temperature ?? 0.2,
    };
    if (opts?.tools) body.tools = opts.tools;
    if (opts?.tool_choice) body.tool_choice = opts.tool_choice;
    if (opts?.response_format) body.response_format = opts.response_format;
    if (opts?.max_tokens) body.max_tokens = opts.max_tokens;

    const res = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LLM request failed: ${res.status} ${res.statusText}\n${body}`);
    }

    return await res.json() as LlmChatResponse;
  }

  async chatText(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
    const json = await this.chat(messages, opts);
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM response did not contain message content.");
    return content;
  }

  async chatJson<T>(messages: ChatMessage[], opts?: ChatOptions): Promise<T> {
    const text = await this.chatText(messages, opts);
    return extractJson<T>(text);
  }
}
