import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppConfig } from "../config/schema.js";
import { writeText } from "../utils/fs.js";
import { FrameworkError } from "../utils/errors.js";

export interface RunK6Options {
  script: string;
  env?: Record<string, string>;
  extraArgs?: string[];
  docker?: boolean;
  dryRun?: boolean;
  timeoutMs?: number;
}

export interface K6RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  summaryPath?: string;
}

export async function runK6(config: AppConfig, options: RunK6Options): Promise<K6RunResult> {
  if (options.dryRun) {
    return { exitCode: 0, stdout: "dry-run", stderr: "" };
  }

  const summaryDir = mkdtempSync(join(tmpdir(), "k6-agent-"));
  const summaryPath = join(summaryDir, "summary.json");
  const args = [
    "run",
    options.script,
    "--summary-export",
    summaryPath,
    ...(options.extraArgs ?? []),
  ];

  const bin = options.docker ? "docker" : config.k6.bin;
  const fullArgs = options.docker
    ? ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", config.k6.dockerImage, ...args]
    : args;

  try {
    const result = await spawnCapture(bin, fullArgs, options.env ?? {}, options.timeoutMs ?? config.k6.timeoutMs);
    return { ...result, summaryPath };
  } catch (error) {
    if (error instanceof FrameworkError) throw error;
    throw new FrameworkError(
      "K6_EXEC",
      `Failed to execute k6: ${String(error)}`,
      "Install k6 (https://grafana.com/docs/k6/latest/set-up/install-k6/) or run with --docker. Check: k6-agent doctor",
    );
  }
}

function spawnCapture(
  bin: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new FrameworkError("K6_TIMEOUT", `k6 exceeded timeout ${timeoutMs}ms.`));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new FrameworkError(
          "K6_NOT_FOUND",
          `Unable to start "${bin}": ${err.message}`,
          "Install k6 or set k6.bin / K6_BIN. Run: k6-agent doctor",
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

export function writeDryRunPlan(path: string, plan: string): void {
  writeText(path, plan);
}
