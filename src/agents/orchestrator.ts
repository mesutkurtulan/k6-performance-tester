import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AppConfig } from "../config/schema.js";
import {
  Coverage,
  Decision,
  GeneratedFile,
  NormalizedApiModel,
  NormalizedResult,
  PerformanceAnalysis,
  PerformanceStrategy,
  ReviewResult,
  TestType,
  Workflow,
} from "../models/schemas.js";
import { Logger } from "../utils/logger.js";
import { newId } from "../utils/id.js";
import { parseInput } from "../parsers/index.js";
import { applyExclusions, computeCoverage, discoverWorkflows } from "./workflow.js";
import { designStrategy } from "./performance-strategist.js";
import { generateK6 } from "./k6-generator.js";
import { generateFixtures } from "./test-data.js";
import { recommendThresholds } from "./threshold.js";
import { reviewTests } from "./test-reviewer.js";
import { evaluateSafety } from "../safety/index.js";
import { runK6 } from "./execution.js";
import { parseK6Summary } from "./result-analyzer.js";
import { analyzeResults } from "./performance-analyst.js";
import { parseFormats, writeReports } from "../reporters/index.js";
import { PersonaId } from "../personas/index.js";
import { LLMProvider } from "../providers/llm/index.js";
import { FrameworkError } from "../utils/errors.js";
import { writeText } from "../utils/fs.js";
import { observabilityArgs } from "../observability/outputs.js";
import { loadBaseline, saveBaseline } from "../store/baselines.js";
import { compareResults } from "./regression.js";

export interface OrchestratorOptions {
  input?: string;
  testType?: TestType;
  outDir?: string;
  environment?: string;
  rate?: number;
  duration?: string;
  vus?: number;
  includeDestructive?: boolean;
  includeNegative?: boolean;
  reports?: string;
  force?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  docker?: boolean;
  script?: string;
  extraEnv?: Record<string, string>;
  persistDecisions?: boolean;
  p95Ms?: number;
  errorRate?: number;
  lang?: "js" | "ts";
  saveBaseline?: boolean;
  compareBaseline?: string;
}

export interface RunState {
  runId: string;
  apiModel?: NormalizedApiModel;
  workflows?: Workflow[];
  strategy?: PerformanceStrategy;
  generatedTests?: GeneratedFile[];
  review?: ReviewResult;
  results?: NormalizedResult;
  analysis?: PerformanceAnalysis;
  coverage?: Coverage;
  decisions: Decision[];
  reports: string[];
}

export class Orchestrator {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly llm: LLMProvider,
    private readonly persona: PersonaId,
  ) {}

  analyze(input: string, includeDestructive = false): RunState {
    const state = this.empty();
    this.logger.info("orchestrator", `Input detected from ${input}`);
    const parsed = parseInput(input);
    this.logger.success("api-analyzer", `${parsed.endpoints.length} endpoints discovered`);
    const { model, decisions } = applyExclusions(parsed, {
      includeDestructive,
      environment: "dev",
    });
    state.apiModel = model;
    state.decisions.push(...decisions);
    if (model.authentication.length) {
          this.logger.success(
            "auth",
            `detected types [${model.authentication.map((a) => a.type).join(", ")}]`,
          );
    } else {
      this.logger.info("auth", "No authentication schemes found");
    }
    state.workflows = discoverWorkflows(model);
    this.logger.success("workflow", `${state.workflows.length} workflows discovered`);
    state.coverage = computeCoverage(
      model,
      model.endpoints.filter((e) => !e.excluded),
    );
    this.logger.verbose("orchestrator", `AI provider=${this.llm.name} enabled=${this.llm.enabled}`);
    return state;
  }

  generate(input: string, options: OrchestratorOptions): RunState {
    const state = this.analyze(input, options.includeDestructive);
    const testType = options.testType ?? "load";
    const strategy = designStrategy(testType, this.config, {
      rate: options.rate,
      duration: options.duration,
      vus: options.vus,
    });
    const sla = recommendThresholds(this.config, {
      p95Ms: options.p95Ms,
      errorRate: options.errorRate,
    });
    strategy.thresholds = sla;
    state.strategy = strategy;
    state.decisions.push({
      decision: `use ${strategy.scenarios[0]?.executor}`,
      reason: `User requested ${testType} testing with documented default assumptions.`,
      agent: "performance-strategist",
      confidence: 0.9,
    });
    this.logger.success("strategist", `${testType} scenario created`);

    const outDir = options.outDir ?? "generated-tests";
    const files = generateK6(state.apiModel!, strategy, state.workflows ?? [], {
      outDir,
      includeDestructive: Boolean(options.includeDestructive),
      includeNegative: options.includeNegative !== false,
      lang: options.lang ?? "js",
    });
    for (const file of files) {
      writeText(file.path, file.contents);
    }
    writeText(
      join(outDir, "data", "environments.json"),
      JSON.stringify(generateFixtures(state.apiModel!).environments, null, 2),
    );
    state.generatedTests = files;
    this.logger.success("k6-generator", `${files.length} files generated in ${outDir}`);

    state.review = reviewTests(outDir);
    this.logger.info("reviewer", `verdict=${state.review.verdict}`);
    if (options.persistDecisions) this.persist(state);
    return state;
  }

  review(dir: string): ReviewResult {
    const result = reviewTests(dir);
    this.logger.info("reviewer", `verdict=${result.verdict} findings=${result.findings.length}`);
    return result;
  }

  async execute(script: string, options: OrchestratorOptions): Promise<RunState> {
    const state = this.empty();
    const strategy = designStrategy(options.testType ?? "load", this.config, options);
    state.strategy = strategy;
    const envName = options.environment ?? "dev";
    const safety = evaluateSafety(this.config, {
      environment: envName,
      testType: options.testType ?? "load",
      strategy,
      hasDestructive: Boolean(options.includeDestructive),
      force: options.force,
      yes: options.yes,
    });
    for (const w of safety.warnings) this.logger.warn("environment", w);

    if (options.dryRun) {
      const plan = dryRunPlan(script, envName, strategy, this.config);
      this.logger.info("execution", plan);
      return state;
    }

    if (state.review?.verdict === "FAIL" && !options.force) {
      throw new FrameworkError(
        "REVIEW_FAIL",
        "Test review failed. Refusing to execute.",
        "Fix findings or pass --force to override.",
      );
    }

    const env = {
      BASE_URL: options.extraEnv?.BASE_URL ?? this.config.environments[envName]?.baseUrl ?? "",
      RATE: String(options.rate ?? this.config.performance.defaultRate),
      DURATION: options.duration ?? this.config.performance.defaultDuration,
      ...options.extraEnv,
    };

    this.logger.info("execution", `running ${script}`);
    const result = await runK6(this.config, {
      script,
      env,
      docker: options.docker,
      timeoutMs: this.config.k6.timeoutMs,
      extraArgs: observabilityArgs(this.config),
    });
    if (result.summaryPath) {
      state.results = parseK6Summary(result.summaryPath);
    } else {
      throw new FrameworkError(
        "K6_NO_SUMMARY",
        "k6 did not produce a summary export.",
        result.stderr || result.stdout,
      );
    }
    state.analysis = analyzeResults(state.results, this.persona);
    const formats = parseFormats(options.reports ?? this.config.reporting.formats.join(","));
    state.reports = writeReports(
      this.config.reporting.directory,
      state.results,
      state.analysis,
      state.coverage,
      formats,
    );
    this.logger.success("report", state.reports.join(", "));
    const compareName = options.compareBaseline ?? (this.config.baselines.autoCompare ? "latest" : undefined);
    if (compareName && state.results) {
      try {
        const baseline = loadBaseline(compareName, this.config.baselines.directory);
        const regression = compareResults(state.results, baseline.results, this.config.baselines.tolerancePct);
        state.decisions.push({
          decision: regression.regressed ? "regression detected" : "no regression vs baseline",
          reason: `Compared to baseline "${baseline.name}" saved ${baseline.savedAt} (tolerance ${this.config.baselines.tolerancePct}%).`,
          agent: "performance-regression",
          confidence: 0.8,
        });
        this.logger.info("regression", regression.regressed ? "REGRESSED" : "within tolerance");
      } catch (error) {
        if (error instanceof FrameworkError && error.code === "BASELINE_MISSING") {
          this.logger.warn("regression", error.message);
        } else {
          throw error;
        }
      }
    }
    if (options.saveBaseline !== false && this.config.baselines.autoSave && state.results) {
      const path = saveBaseline(state.results, "latest", this.config.baselines.directory);
      this.logger.success("baseline", `saved ${path}`);
    }
    if (result.exitCode !== 0 && state.results.passed === false) {
      this.logger.warn("execution", `k6 exit code ${result.exitCode}`);
    }
    return state;
  }

  reportFromSummary(summaryPath: string, formats: string): string[] {
    const results = parseK6Summary(summaryPath);
    const analysis = analyzeResults(results, this.persona);
    return writeReports(
      this.config.reporting.directory,
      results,
      analysis,
      undefined,
      parseFormats(formats),
    );
  }

  persist(state: RunState): void {
    const dir = ".agent";
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "decisions.json"),
      JSON.stringify({ runId: state.runId, decisions: state.decisions }, null, 2),
    );
    writeFileSync(join(dir, "state.json"), JSON.stringify(state, null, 2));
  }

  private empty(): RunState {
    return { runId: newId(), decisions: [], reports: [] };
  }
}

function dryRunPlan(
  script: string,
  env: string,
  strategy: PerformanceStrategy,
  config: AppConfig,
): string {
  const s = strategy.scenarios[0];
  const rate = s?.rate ?? config.performance.defaultRate;
  const duration = s?.duration ?? config.performance.defaultDuration;
  return [
    "DRY RUN — k6 will not execute",
    `Target: ${config.environments[env]?.baseUrl ?? env}`,
    `Script: ${script}`,
    `Executor: ${s?.executor}`,
    `VUs: ${s?.vus ?? s?.preAllocatedVUs ?? config.performance.defaultVUs}`,
    `Rate: ${rate}`,
    `Duration: ${duration}`,
    `Estimated requests: ~${estimateRequests(rate, duration)}`,
    "Potentially destructive endpoints: inspect generated tests for DELETE",
  ].join("\n");
}

function estimateRequests(rate: number, duration: string): number {
  const m = duration.match(/(\d+)([smh])/);
  if (!m) return rate * 60;
  const n = Number(m[1]);
  const mul = m[2] === "h" ? 3600 : m[2] === "m" ? 60 : 1;
  return rate * n * mul;
}

export function explainDecision(state: RunState, question: string): string {
  const q = question.toLowerCase();
  if (q.includes("threshold")) {
    return (
      state.strategy?.thresholds.map((t) => `${t.metric} ${t.expression}: ${t.reason} (source=${t.source})`).join("\n") ??
      "No thresholds in state. Run generate first."
    );
  }
  if (q.includes("exclud")) {
    return (
      state.coverage?.exclusions.map((e) => `${e.method} ${e.path}: ${e.reason}`).join("\n") ??
      "No coverage data. Run analyze first."
    );
  }
  if (q.includes("executor") || q.includes("scenario")) {
    return (
      state.decisions.map((d) => `${d.agent}: ${d.decision} — ${d.reason}`).join("\n") ||
      "No decisions recorded."
    );
  }
  if (q.includes("fail")) {
    return state.analysis?.summary ?? "No analysis yet. Run tests first.";
  }
  return state.decisions.map((d) => `${d.agent}: ${d.decision} — ${d.reason}`).join("\n") || "No decisions recorded.";
}
