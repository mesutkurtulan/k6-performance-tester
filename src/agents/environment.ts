import { AppConfig } from "../config/schema.js";

export function resolveEnvironment(config: AppConfig, name: string) {
  const env = config.environments[name];
  if (!env) {
    return {
      name,
      baseUrl: process.env.BASE_URL ?? "http://127.0.0.1:4010",
      production: name === "production",
      unknown: true,
    };
  }
  return { name, ...env, unknown: false };
}
