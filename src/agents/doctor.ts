import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { AppConfig } from "../config/schema.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  warn: boolean;
  detail: string;
}

export function runDoctor(config: AppConfig): DoctorCheck[] {
  return [
    check("Node.js", () => process.version, true),
    check("npm", () => which("npm"), true),
    check("k6", () => which(config.k6.bin), true),
    check("Docker", () => which("docker"), false),
    {
      name: "AI provider",
      ok: true,
      warn: config.ai.provider !== "disabled" && !config.ai.apiKey && config.ai.provider !== "ollama",
      detail:
        config.ai.provider === "disabled"
          ? "disabled (deterministic mode)"
          : config.ai.apiKey || config.ai.provider === "ollama"
            ? config.ai.provider
            : `${config.ai.provider} missing AI_API_KEY`,
    },
    {
      name: "Configuration",
      ok: true,
      warn: false,
      detail: `safety.maxVUs=${config.safety.maxVUs} maxRate=${config.safety.maxRate}`,
    },
    {
      name: "Filesystem",
      ok: true,
      warn: !writable("."),
      detail: writable(".") ? "cwd writable" : "cwd not writable",
    },
  ];
}

function check(name: string, fn: () => string | undefined, required: boolean): DoctorCheck {
  try {
    const detail = fn();
    if (!detail) {
      return { name, ok: !required, warn: !required, detail: "not found" };
    }
    return { name, ok: true, warn: false, detail };
  } catch {
    return { name, ok: !required, warn: !required, detail: "not found" };
  }
}

function which(bin: string): string | undefined {
  const cmd = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(cmd, [bin], { encoding: "utf8" });
  if (r.status === 0) return r.stdout.trim().split("\n")[0];
  return undefined;
}

function writable(path: string): boolean {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
