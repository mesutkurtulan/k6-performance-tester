import { AppConfig } from "../../config/schema.js";
import { FrameworkError } from "../../utils/errors.js";
import { LLMProvider, LLMRequest } from "./types.js";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  readonly enabled = true;

  constructor(private readonly config: AppConfig) {}

  async complete(request: LLMRequest): Promise<string> {
    const apiKey = this.config.ai.apiKey;
    if (!apiKey) {
      throw new FrameworkError("AI_KEY_MISSING", "Gemini API key is not configured.");
    }
    const model = this.config.ai.model ?? "gemini-2.0-flash";
    const prompt = request.messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
    );
    if (!res.ok) {
      throw new FrameworkError("AI_HTTP", `Gemini request failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  }
}
