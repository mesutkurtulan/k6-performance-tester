import { AppConfig } from "../config/schema.js";
import { Threshold } from "../models/schemas.js";
import { defaultThresholds } from "./performance-strategist.js";

export function recommendThresholds(
  config: AppConfig,
  userSla?: { p95Ms?: number; errorRate?: number },
): Threshold[] {
  if (userSla?.p95Ms || userSla?.errorRate) {
    const p95 = userSla.p95Ms ?? config.performance.p95Ms;
    const errorRate = userSla.errorRate ?? config.performance.errorRate;
    return [
      {
        metric: "http_req_duration",
        percentile: "p95",
        threshold: p95,
        expression: `p(95)<${p95}`,
        source: "user-defined",
        reason: "User-supplied SLA.",
      },
      {
        metric: "http_req_failed",
        expression: `rate<${errorRate}`,
        threshold: errorRate,
        source: "user-defined",
        reason: "User-supplied error-rate SLA.",
      },
    ];
  }
  return defaultThresholds(config);
}
