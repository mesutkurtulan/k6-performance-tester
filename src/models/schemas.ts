import { z } from "zod";

export const HttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

export const AuthTypeSchema = z.enum([
  "none",
  "bearer",
  "oauth2",
  "basic",
  "apiKey",
  "cookie",
  "jwt",
  "customHeader",
]);

export const ParameterSchema = z.object({
  name: z.string(),
  in: z.enum(["path", "query", "header", "cookie"]),
  required: z.boolean().default(false),
  schema: z.unknown().optional(),
  example: z.unknown().optional(),
  description: z.string().optional(),
});

export const ResponseSchema = z.object({
  status: z.string(),
  description: z.string().optional(),
  schema: z.unknown().optional(),
});

export const EndpointSchema = z.object({
  id: z.string(),
  path: z.string(),
  method: HttpMethodSchema,
  operationId: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).default([]),
  authentication: AuthTypeSchema.default("none"),
  security: z.array(z.string()).default([]),
  pathParameters: z.array(ParameterSchema).default([]),
  queryParameters: z.array(ParameterSchema).default([]),
  headerParameters: z.array(ParameterSchema).default([]),
  requestBody: z
    .object({
      required: z.boolean().default(false),
      contentType: z.string().optional(),
      schema: z.unknown().optional(),
      example: z.unknown().optional(),
    })
    .optional(),
  responses: z.array(ResponseSchema).default([]),
  links: z
    .array(
      z.object({
        name: z.string(),
        operationId: z.string().optional(),
        operationRef: z.string().optional(),
        parameters: z.record(z.string()).default({}),
      }),
    )
    .default([]),
  destructive: z.boolean().default(false),
  paginated: z.boolean().default(false),
  deprecated: z.boolean().default(false),
  excluded: z.boolean().default(false),
  exclusionReason: z.string().optional(),
});

export const AuthSchemeSchema = z.object({
  name: z.string(),
  type: AuthTypeSchema,
  envVars: z.array(z.string()).default([]),
  headerName: z.string().optional(),
  location: z.enum(["header", "query", "cookie"]).optional(),
  description: z.string().optional(),
});

export const NormalizedApiModelSchema = z.object({
  source: z.object({
    type: z.enum(["openapi", "postman", "curl", "k6", "har"]),
    path: z.string(),
    title: z.string().optional(),
    version: z.string().optional(),
  }),
  servers: z.array(z.string()).default([]),
  baseUrl: z.string().optional(),
  authentication: z.array(AuthSchemeSchema).default([]),
  endpoints: z.array(EndpointSchema),
  warnings: z.array(z.string()).default([]),
  unsupported: z.array(z.string()).default([]),
});

export const WorkflowStepSchema = z.object({
  id: z.string(),
  endpointId: z.string(),
  extracts: z.array(z.string()).default([]),
  uses: z.array(z.string()).default([]),
});

export const WorkflowSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  steps: z.array(WorkflowStepSchema),
  variables: z.array(z.string()).default([]),
  correlation: z.array(z.string()).default([]),
  dataDependencies: z.array(z.string()).default([]),
});

export const TestTypeSchema = z.enum([
  "smoke",
  "load",
  "stress",
  "spike",
  "soak",
  "breakpoint",
  "custom",
]);

export const ThresholdSchema = z.object({
  metric: z.string(),
  expression: z.string(),
  percentile: z.string().optional(),
  threshold: z.number().optional(),
  source: z.enum([
    "user-defined",
    "existing-config",
    "historical-baseline",
    "specification",
    "ai-recommendation",
    "framework-default",
  ]),
  reason: z.string(),
});

export const ScenarioSchema = z.object({
  name: z.string(),
  executor: z.string(),
  rate: z.number().optional(),
  timeUnit: z.string().optional(),
  duration: z.string().optional(),
  vus: z.number().optional(),
  preAllocatedVUs: z.number().optional(),
  maxVUs: z.number().optional(),
  stages: z
    .array(z.object({ duration: z.string(), target: z.number() }))
    .optional(),
  gracefulRampDown: z.string().optional(),
});

export const PerformanceStrategySchema = z.object({
  testType: TestTypeSchema,
  scenarios: z.array(ScenarioSchema),
  thresholds: z.array(ThresholdSchema),
  endpointDistribution: z.record(z.number()).default({}),
  testDataRequirements: z.array(z.string()).default([]),
  assumptions: z.array(z.string()),
  negativeTesting: z.array(z.string()).default([]),
  rateLimitPlan: z
    .object({
      inferred: z.boolean(),
      stages: z.array(z.string()).default([]),
    })
    .optional(),
});

export const ReviewSeveritySchema = z.enum(["PASS", "WARN", "FAIL"]);

export const ReviewFindingSchema = z.object({
  severity: ReviewSeveritySchema,
  code: z.string(),
  message: z.string(),
  file: z.string().optional(),
});

export const ReviewResultSchema = z.object({
  verdict: ReviewSeveritySchema,
  findings: z.array(ReviewFindingSchema),
});

export const DecisionSchema = z.object({
  decision: z.string(),
  reason: z.string(),
  agent: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

export const MetricSummarySchema = z.object({
  count: z.number().optional(),
  rate: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  avg: z.number().optional(),
  p50: z.number().optional(),
  p90: z.number().optional(),
  p95: z.number().optional(),
  p99: z.number().optional(),
  value: z.number().optional(),
  passes: z.number().optional(),
  fails: z.number().optional(),
});

export const NormalizedResultSchema = z.object({
  metrics: z.record(MetricSummarySchema),
  thresholds: z.array(
    z.object({
      name: z.string(),
      passed: z.boolean(),
    }),
  ),
  rootGroup: z.unknown().optional(),
  passed: z.boolean(),
  rawPath: z.string().optional(),
});

export const PerformanceAnalysisSchema = z.object({
  overall: z.enum(["PASS", "FAIL", "UNKNOWN"]),
  summary: z.string(),
  primaryIssue: z.string().optional(),
  observations: z.array(z.string()).default([]),
  likely: z.array(z.string()).default([]),
  possible: z.array(z.string()).default([]),
  unknown: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  personaView: z.string().optional(),
});

export const GeneratedFileSchema = z.object({
  path: z.string(),
  contents: z.string(),
});

export const CoverageSchema = z.object({
  total: z.number(),
  covered: z.number(),
  uncovered: z.number(),
  byMethod: z.record(z.object({ total: z.number(), covered: z.number() })),
  exclusions: z.array(
    z.object({
      method: z.string(),
      path: z.string(),
      reason: z.string(),
    }),
  ),
});

export type HttpMethod = z.infer<typeof HttpMethodSchema>;
export type AuthType = z.infer<typeof AuthTypeSchema>;
export type Endpoint = z.infer<typeof EndpointSchema>;
export type AuthScheme = z.infer<typeof AuthSchemeSchema>;
export type NormalizedApiModel = z.infer<typeof NormalizedApiModelSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type TestType = z.infer<typeof TestTypeSchema>;
export type Threshold = z.infer<typeof ThresholdSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type PerformanceStrategy = z.infer<typeof PerformanceStrategySchema>;
export type ReviewResult = z.infer<typeof ReviewResultSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type NormalizedResult = z.infer<typeof NormalizedResultSchema>;
export type PerformanceAnalysis = z.infer<typeof PerformanceAnalysisSchema>;
export type GeneratedFile = z.infer<typeof GeneratedFileSchema>;
export type Coverage = z.infer<typeof CoverageSchema>;
export type Parameter = z.infer<typeof ParameterSchema>;
