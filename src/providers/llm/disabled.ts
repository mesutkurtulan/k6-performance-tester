import { LLMProvider, LLMRequest } from "./types.js";

export class DisabledProvider implements LLMProvider {
  readonly name = "disabled";
  readonly enabled = false;

  async complete(_request: LLMRequest): Promise<string> {
    throw new Error("AI provider is disabled. Deterministic agents must not call complete().");
  }
}
