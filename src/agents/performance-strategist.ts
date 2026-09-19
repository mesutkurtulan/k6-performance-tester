import { AppConfig } from "../config/schema.js";
import {
  PerformanceStrategy,
  PerformanceStrategySchema,
  TestType,
  Threshold,
} from "../models/schemas.js";
import { parseDurationMs } from "../utils/duration.js";

export function designStrategy(
  testType: TestType,
  config: AppConfig,
  options: { rate?: number; duration?: string; vus?: number } = {},
): PerformanceStrategy {
  const rate = options.rate ?? config.performance.defaultRate;
  const duration = options.duration ?? config.performance.defaultDuration;
  const vus = options.vus ?? config.performance.defaultVUs;
  const thresholds = defaultThresholds(config);

  const strategy = build(testType, rate, duration, vus, thresholds);
  return PerformanceStrategySchema.parse(strategy);
}

function build(
  testType: TestType,
  rate: number,
  duration: string,
  vus: number,
  thresholds: Threshold[],
): PerformanceStrategy {
  const assumptions: string[] = [
    `No production telemetry was supplied; traffic uses framework defaults (rate=${rate}/s, duration=${duration}) unless overridden.`,
    "Thresholds are framework recommendations, not contractual SLAs.",
  ];

  switch (testType) {
    case "smoke":
      return {
        testType,
        scenarios: [
          {
            name: "smoke",
            executor: "constant-vus",
            vus: 1,
            duration: "30s",
          },
        ],
        thresholds,
        endpointDistribution: {},
        testDataRequirements: ["minimal valid payloads"],
        assumptions: [
          ...assumptions,
          "Smoke verifies script correctness and auth, not capacity.",
        ],
        negativeTesting: ["401 without token"],
      };
    case "stress":
      return {
        testType,
        scenarios: [
          {
            name: "stress",
            executor: "ramping-arrival-rate",
            timeUnit: "1s",
            preAllocatedVUs: Math.max(vus, 10),
            maxVUs: Math.max(vus * 10, 50),
            stages: [
              { duration: "1m", target: rate },
              { duration: "2m", target: rate * 2 },
              { duration: "2m", target: rate * 4 },
              { duration: "1m", target: 0 },
            ],
          },
        ],
        thresholds,
        endpointDistribution: {},
        testDataRequirements: ["unique identifiers to avoid write collisions"],
        assumptions: [...assumptions, "Stress ramps to 4x the requested rate."],
        negativeTesting: ["429 if rate limiting is documented"],
      };
    case "spike":
      return {
        testType,
        scenarios: [
          {
            name: "spike",
            executor: "ramping-arrival-rate",
            timeUnit: "1s",
            preAllocatedVUs: vus,
            maxVUs: Math.max(vus * 8, 40),
            stages: [
              { duration: "10s", target: rate },
              { duration: "10s", target: rate * 5 },
              { duration: "1m", target: rate },
              { duration: "10s", target: 0 },
            ],
          },
        ],
        thresholds,
        endpointDistribution: {},
        testDataRequirements: [],
        assumptions: [...assumptions, "Spike uses a 5x burst for 10 seconds."],
        negativeTesting: [],
      };
    case "soak":
      return {
        testType,
        scenarios: [
          {
            name: "soak",
            executor: "constant-arrival-rate",
            rate,
            timeUnit: "1s",
            duration: durationMinutes(duration) < 30 ? "30m" : duration,
            preAllocatedVUs: vus,
            maxVUs: Math.max(vus * 5, 25),
          },
        ],
        thresholds,
        endpointDistribution: {},
        testDataRequirements: ["large unique dataset to avoid cache-only reads"],
        assumptions: [...assumptions, "Soak defaults to at least 30 minutes."],
        negativeTesting: [],
      };
    case "breakpoint":
      return {
        testType,
        scenarios: [
          {
            name: "breakpoint",
            executor: "ramping-arrival-rate",
            timeUnit: "1s",
            preAllocatedVUs: vus,
            maxVUs: Math.max(vus * 20, 100),
            stages: [
              { duration: "2m", target: rate },
              { duration: "2m", target: rate * 2 },
              { duration: "2m", target: rate * 4 },
              { duration: "2m", target: rate * 8 },
            ],
          },
        ],
        thresholds,
        endpointDistribution: {},
        testDataRequirements: [],
        assumptions: [...assumptions, "Breakpoint keeps raising rate until failures appear."],
        negativeTesting: ["500/502/503 under saturation"],
      };
    case "custom":
    case "load":
    default:
      return {
        testType: testType === "custom" ? "custom" : "load",
        scenarios: [
          {
            name: "load",
            executor: "constant-arrival-rate",
            rate,
            timeUnit: "1s",
            duration,
            preAllocatedVUs: vus,
            maxVUs: Math.max(vus * 10, 50),
          },
        ],
        thresholds,
        endpointDistribution: {},
        testDataRequirements: ["steady-state payloads"],
        assumptions,
        negativeTesting: ["400 invalid body on a write endpoint"],
      };
  }
}

export function defaultThresholds(config: AppConfig): Threshold[] {
  return [
    {
      metric: "http_req_duration",
      percentile: "p95",
      threshold: config.performance.p95Ms,
      expression: `p(95)<${config.performance.p95Ms}`,
      source: "framework-default",
      reason: "No explicit SLA was found. This is a framework recommendation, not an authoritative SLA.",
    },
    {
      metric: "http_req_failed",
      expression: `rate<${config.performance.errorRate}`,
      threshold: config.performance.errorRate,
      source: "framework-default",
      reason: "Default error-rate gate until an SLA is provided.",
    },
  ];
}

function durationMinutes(value: string): number {
  return parseDurationMs(value) / 60_000;
}
