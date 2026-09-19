import { AppConfig } from "../../config/schema.js";
import { OpenAIProvider } from "./openai.js";

export class OpenAICompatibleProvider extends OpenAIProvider {
  constructor(config: AppConfig) {
    super(
      {
        ...config,
        ai: {
          ...config.ai,
          baseUrl: config.ai.baseUrl ?? "http://127.0.0.1:11434/v1",
        },
      },
      "openai-compatible",
    );
  }
}
