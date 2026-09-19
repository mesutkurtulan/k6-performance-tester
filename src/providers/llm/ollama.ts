import { AppConfig } from "../../config/schema.js";
import { FrameworkError } from "../../utils/errors.js";
import { LLMProvider, LLMRequest } from "./types.js";

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  readonly enabled = true;

  constructor(private readonly config: AppConfig) {}

  async complete(request: LLMRequest): Promise<string> {
    const base = this.config.ai.baseUrl ?? "http://127.0.0.1:11434";
    const model = this.config.ai.model ?? "llama3.1";
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: request.messages,
        format: request.json ? "json" : undefined,
      }),
    });
    if (!res.ok) {
      throw new FrameworkError(
        "AI_HTTP",
        `Ollama request failed: ${res.status}`,
        `Is Ollama running at ${base}?`,
      );
    }
    const json = (await res.json()) as { message?: { content?: string } };
    return json.message?.content ?? "{}";
  }
}
