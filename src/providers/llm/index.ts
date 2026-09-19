import { AppConfig } from "../../config/schema.js";
import { AnthropicProvider } from "./anthropic.js";
import { DisabledProvider } from "./disabled.js";
import { GeminiProvider } from "./gemini.js";
import { OllamaProvider } from "./ollama.js";
import { OpenAICompatibleProvider } from "./compatible.js";
import { OpenAIProvider } from "./openai.js";
import { LLMProvider } from "./types.js";

export function createLLMProvider(config: AppConfig): LLMProvider {
  switch (config.ai.provider) {
    case "openai":
      return new OpenAIProvider(config);
    case "anthropic":
      return new AnthropicProvider(config);
    case "gemini":
      return new GeminiProvider(config);
    case "ollama":
      return new OllamaProvider(config);
    case "openai-compatible":
      return new OpenAICompatibleProvider(config);
    default:
      return new DisabledProvider();
  }
}

export type { LLMProvider, LLMRequest } from "./types.js";
export { completeJson } from "./types.js";
export { DisabledProvider } from "./disabled.js";
