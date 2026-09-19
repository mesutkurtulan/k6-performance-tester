import { AppConfig } from "../../config/schema.js";
import { FrameworkError } from "../../utils/errors.js";
import { LLMProvider, LLMRequest } from "./types.js";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly enabled = true;

  constructor(private readonly config: AppConfig) {}

  async complete(request: LLMRequest): Promise<string> {
    const apiKey = this.config.ai.apiKey;
    if (!apiKey) {
      throw new FrameworkError("AI_KEY_MISSING", "Anthropic API key is not configured.");
    }
    const model = this.config.ai.model ?? "claude-sonnet-4-5";
    const system = request.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const user = request.messages.filter((m) => m.role === "user");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages: user,
      }),
    });
    if (!res.ok) {
      throw new FrameworkError("AI_HTTP", `Anthropic request failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { content?: { text?: string }[] };
    return json.content?.[0]?.text ?? "{}";
  }
}
