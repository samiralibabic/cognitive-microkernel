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
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  parallel_tool_calls?: boolean;
  response_format?: unknown;
  max_tokens?: number;
};

export type LlmProviderRouting = {
  only?: string[];
  allow_fallbacks?: boolean;
  require_parameters?: boolean;
};

export type LlmConfig = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  provider?: LlmProviderRouting;
};

export function loadLlmConfig(): LlmConfig {
  const provider = loadProviderRouting();
  return {
    baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL || "gpt-4.1-mini",
    ...(provider ? { provider } : {}),
  };
}

function loadProviderRouting(): LlmProviderRouting | undefined {
  const provider: LlmProviderRouting = {};
  const only = parseCsvEnv(process.env.LLM_PROVIDER_ONLY);
  const allowFallbacks = parseBooleanEnv(process.env.LLM_PROVIDER_ALLOW_FALLBACKS);
  const requireParameters = parseBooleanEnv(process.env.LLM_PROVIDER_REQUIRE_PARAMETERS);

  if (only) provider.only = only;
  if (allowFallbacks !== undefined) provider.allow_fallbacks = allowFallbacks;
  if (requireParameters !== undefined) provider.require_parameters = requireParameters;

  return Object.keys(provider).length > 0 ? provider : undefined;
}

function parseCsvEnv(value: string | undefined): string[] | undefined {
  const items = value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  return items.length ? items : undefined;
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
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
    if (opts?.parallel_tool_calls !== undefined) body.parallel_tool_calls = opts.parallel_tool_calls;
    if (opts?.response_format) body.response_format = opts.response_format;
    if (opts?.max_tokens) body.max_tokens = opts.max_tokens;
    if (this.config.provider) body.provider = this.config.provider;

    const res = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "HTTP-Referer": "https://samiralibabic.com",
        "X-OpenRouter-Title": "cortex-microkernel",
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
