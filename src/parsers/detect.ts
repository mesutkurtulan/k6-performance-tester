import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { fail } from "../utils/errors.js";

export type SourceType = "openapi" | "postman" | "curl" | "k6" | "har";

export function detectSource(input: string): SourceType {
  const trimmed = input.trim();
  if (looksLikeCurl(trimmed)) return "curl";
  if (existsSync(input)) {
    const text = readFileSync(input, "utf8");
    return detectFromContents(text, input);
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("openapi") || trimmed.startsWith("swagger")) {
    return detectFromContents(trimmed, "inline");
  }
  fail(
    "SOURCE_UNDETECTED",
    `Unable to detect input type for "${input}".`,
    "Provide an OpenAPI file, Postman collection, cURL file, HAR, or existing k6 script.\nRun: k6-agent analyze --verbose",
  );
}

export function detectFromContents(text: string, path: string): SourceType {
  const trimmed = text.trim();
  if (path.endsWith(".har")) return "har";
  if (looksLikeCurl(trimmed) || path.endsWith(".sh") || path.endsWith(".curl")) return "curl";
  if (
    /from ['"]k6\//.test(trimmed) ||
    /import http from ['"]k6\/http['"]/.test(trimmed) ||
    path.includes(".k6.")
  ) {
    return "k6";
  }

  let parsed: unknown;
  try {
    parsed = trimmed.startsWith("{") ? JSON.parse(trimmed) : parseYaml(trimmed);
  } catch {
    if (looksLikeCurl(trimmed)) return "curl";
    fail(
      "PARSE_FAILED",
      `Unable to parse "${path}" as JSON, YAML, cURL, HAR, or k6.`,
      "Run: k6-agent analyze --verbose",
    );
  }

  if (isRecord(parsed)) {
    if (parsed.openapi || parsed.swagger) return "openapi";
    if (isRecord(parsed.log) && Array.isArray(parsed.log.entries)) return "har";
    if (isRecord(parsed.info) && Array.isArray(parsed.item)) return "postman";
  }

  fail(
    "SOURCE_UNSUPPORTED",
    `File "${path}" was parsed but is not OpenAPI, Postman, cURL, HAR, or k6.`,
    "Supported inputs: OpenAPI 2/3, Postman Collection v2, cURL, HAR 1.2, existing k6 tests.",
  );
}

function looksLikeCurl(text: string): boolean {
  return /^\s*curl\s+/m.test(text);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object";
}
