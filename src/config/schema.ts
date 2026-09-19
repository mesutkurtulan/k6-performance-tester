import { z } from "zod";

export const SafetyConfigSchema = z.object({
  maxVUs: z.number().default(100),
  maxRate: z.number().default(500),
  maxDuration: z.string().default("30m"),
  productionRequiresConfirmation: z.boolean().default(true),
  destructiveEndpointsRequireConfirmation: z.boolean().default(true),
});

export const AppConfigSchema = z.object({
  ai: z
    .object({
      provider: z
        .enum(["openai", "anthropic", "gemini", "ollama", "openai-compatible", "disabled"])
        .default("disabled"),
      model: z.string().optional(),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
      tier: z.enum(["fast", "balanced", "advanced"]).default("balanced"),
      models: z
        .object({
          fast: z.string().optional(),
          balanced: z.string().optional(),
          advanced: z.string().optional(),
        })
        .optional(),
    })
    .default({ provider: "disabled" }),
  performance: z
    .object({
      defaultRate: z.number().default(10),
      defaultDuration: z.string().default("5m"),
      defaultVUs: z.number().default(5),
      p95Ms: z.number().default(500),
      errorRate: z.number().default(0.01),
    })
    .default({}),
  safety: SafetyConfigSchema.default({}),
  reporting: z
    .object({
      formats: z.array(z.string()).default(["console", "json", "markdown", "html"]),
      directory: z.string().default("reports"),
    })
    .default({}),
  k6: z
    .object({
      bin: z.string().default("k6"),
      timeoutMs: z.number().default(600_000),
      dockerImage: z.string().default("grafana/k6:latest"),
    })
    .default({}),
  observability: z
    .object({
      influxdbUrl: z.string().optional(),
      prometheusRemoteWrite: z.boolean().default(false),
    })
    .default({}),
  baselines: z
    .object({
      directory: z.string().default(".agent/baselines"),
      autoSave: z.boolean().default(true),
      autoCompare: z.boolean().default(false),
      tolerancePct: z.number().default(10),
    })
    .default({}),
  environments: z
    .record(
      z.object({
        baseUrl: z.string(),
        production: z.boolean().default(false),
      }),
    )
    .default({
      dev: { baseUrl: "http://127.0.0.1:4010", production: false },
      test: { baseUrl: "http://127.0.0.1:4010", production: false },
      uat: { baseUrl: "https://uat.example.com", production: false },
      staging: { baseUrl: "https://staging.example.com", production: false },
      production: { baseUrl: "https://api.example.com", production: true },
    }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
