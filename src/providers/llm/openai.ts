import { AppConfig } from "../../config/schema.js";
import { FrameworkError } from "../../utils/errors.js";
import { LLMProvider, LLMRequest } from "./types.js";

export class OpenAIProvider implements LLMProvider {
  readonly name: string;
  readonly enabled = true;

  constructor(
    private readonly config: AppConfig,
    name = "openai",
  ) {
    this.name = name;
  }

  async complete(request: LLMRequest): Promise<string> {
    const apiKey = this.config.ai.apiKey;
    if (!apiKey) {
      throw new FrameworkError(
        "AI_KEY_MISSING",
        "OpenAI API key is not configured.",
        "Set AI_API_KEY or ai.apiKey in k6-agent.yaml.",
      );
    }
    const model =
      this.config.ai.model ??
      this.config.ai.models?.[request.tier ?? this.config.ai.tier] ??
      "gpt-4.1-mini";
    const base = this.config.ai.baseUrl ?? "https://api.openai.com/v1";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: 0.2,
        response_format: request.json ? { type: "json_object" } : undefined,
      }),
    });
    if (!res.ok) {
      throw new FrameworkError("AI_HTTP", `OpenAI request failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content ?? "{}";
  }
}
