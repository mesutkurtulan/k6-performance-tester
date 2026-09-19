import { AppConfig } from "../config/schema.js";
import { PerformanceStrategy, TestType } from "../models/schemas.js";
import { parseDurationMs } from "../utils/duration.js";
import { FrameworkError } from "../utils/errors.js";

export interface SafetyCheckInput {
  environment: string;
  testType: TestType;
  strategy: PerformanceStrategy;
  hasDestructive: boolean;
  force?: boolean;
  yes?: boolean;
}

export interface SafetyResult {
  blocked: boolean;
  requiresConfirmation: boolean;
  warnings: string[];
}

export function evaluateSafety(config: AppConfig, input: SafetyCheckInput): SafetyResult {
  const warnings: string[] = [];
  const env = config.environments[input.environment];
  const isProd = env?.production || input.environment === "production";
  let requiresConfirmation = false;

  for (const scenario of input.strategy.scenarios) {
    if (scenario.maxVUs && scenario.maxVUs > config.safety.maxVUs) {
      warnings.push(
        `Scenario ${scenario.name} maxVUs=${scenario.maxVUs} exceeds safety.maxVUs=${config.safety.maxVUs}.`,
      );
    }
    if (scenario.rate && scenario.rate > config.safety.maxRate) {
      warnings.push(
        `Scenario ${scenario.name} rate=${scenario.rate} exceeds safety.maxRate=${config.safety.maxRate}.`,
      );
    }
    if (scenario.duration) {
      const max = parseDurationMs(config.safety.maxDuration);
      if (parseDurationMs(scenario.duration) > max) {
        warnings.push(
          `Scenario ${scenario.name} duration ${scenario.duration} exceeds safety.maxDuration=${config.safety.maxDuration}.`,
        );
      }
    }
  }

  if (isProd && config.safety.productionRequiresConfirmation) {
    requiresConfirmation = true;
    warnings.push("Target environment is production.");
  }
  if (input.hasDestructive && config.safety.destructiveEndpointsRequireConfirmation) {
    requiresConfirmation = true;
    warnings.push("Plan includes destructive DELETE endpoints.");
  }
  if (input.testType === "soak") {
    requiresConfirmation = true;
    warnings.push("Soak tests are long-running and may consume significant capacity.");
  }

  const blocked = warnings.some((w) => w.includes("exceeds")) && !input.force;
  if (blocked) {
    throw new FrameworkError(
      "SAFETY_LIMIT",
      warnings.join(" "),
      "Lower the load profile or pass --force to override safety caps.",
    );
  }

  if (requiresConfirmation && !input.yes && !input.force && !process.stdin.isTTY) {
    throw new FrameworkError(
      "SAFETY_CONFIRMATION",
      warnings.join(" "),
      "Re-run with --yes to confirm in CI, or run interactively.",
    );
  }

  return { blocked: false, requiresConfirmation: requiresConfirmation && !input.yes && !input.force, warnings };
}
