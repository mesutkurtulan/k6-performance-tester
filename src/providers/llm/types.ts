import { z, ZodType } from "zod";
import { FrameworkError } from "../../utils/errors.js";

export type LLMMessage = { role: "system" | "user"; content: string };

export interface LLMRequest {
  messages: LLMMessage[];
  json?: boolean;
  tier?: "fast" | "balanced" | "advanced";
}

export interface LLMProvider {
  readonly name: string;
  readonly enabled: boolean;
  complete(request: LLMRequest): Promise<string>;
}

export async function completeJson<T>(
  provider: LLMProvider,
  schema: ZodType<T>,
  request: LLMRequest,
  retries = 1,
): Promise<T> {
  if (!provider.enabled) {
    throw new FrameworkError("AI_DISABLED", "AI is disabled; caller must use a deterministic fallback.");
  }
  let lastError: unknown;
  for (let i = 0; i <= retries; i++) {
    const raw = await provider.complete({ ...request, json: true });
    const extracted = extractJson(raw);
    const parsed = schema.safeParse(extracted);
    if (parsed.success) return parsed.data;
    lastError = parsed.error;
    request = {
      ...request,
      messages: [
        ...request.messages,
        {
          role: "user",
          content: `Your previous output failed schema validation: ${parsed.error.message}. Return valid JSON only.`,
        },
      ],
    };
  }
  throw new FrameworkError(
    "AI_INVALID_OUTPUT",
    "The model returned data that did not match the required schema.",
    `Validation: ${String(lastError)}\nRetry with --verbose or switch to --provider disabled.`,
  );
}

export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1));
  }
  return JSON.parse(candidate);
}

export function assertNeverDisabledSchema(): z.ZodType<unknown> {
  return z.unknown();
}
