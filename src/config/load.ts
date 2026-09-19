import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { config as loadDotenv } from "dotenv";
import { AppConfig, AppConfigSchema } from "./schema.js";

export function loadConfig(configPath?: string, cwd = process.cwd()): AppConfig {
  loadDotenv({ path: resolve(cwd, ".env") });

  const candidates = configPath
    ? [resolve(cwd, configPath)]
    : [
        resolve(cwd, "k6-agent.yaml"),
        resolve(cwd, "k6-agent.yml"),
        resolve(cwd, "k6-agent.json"),
        resolve(cwd, "config/default.yaml"),
      ];

  let fileConfig: unknown = {};
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, "utf8");
    fileConfig = file.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);
    break;
  }

  const envOverlay: Record<string, unknown> = {
    ai: {
      provider: process.env.AI_PROVIDER,
      model: process.env.AI_MODEL,
      apiKey: process.env.AI_API_KEY,
      baseUrl: process.env.AI_BASE_URL,
      tier: process.env.AI_TIER,
    },
    k6: {
      bin: process.env.K6_BIN,
      timeoutMs: process.env.K6_TIMEOUT_MS ? Number(process.env.K6_TIMEOUT_MS) : undefined,
    },
  };

  return AppConfigSchema.parse(deepMerge(fileConfig, stripUndefined(envOverlay)));
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out;
  }
  return value;
}

function deepMerge(a: unknown, b: unknown): unknown {
  if (Array.isArray(a) && Array.isArray(b)) return b;
  if (isObject(a) && isObject(b)) {
    const out: Record<string, unknown> = { ...a };
    for (const [k, v] of Object.entries(b)) {
      out[k] = k in out ? deepMerge(out[k], v) : v;
    }
    return out;
  }
  return b === undefined ? a : b;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
