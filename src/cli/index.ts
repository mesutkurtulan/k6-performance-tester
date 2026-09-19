#!/usr/bin/env node
import { Command } from "commander";
import prompts from "prompts";
import pc from "picocolors";
import { loadConfig } from "../config/load.js";
import { Logger, LogLevel } from "../utils/logger.js";
import { createLLMProvider } from "../providers/llm/index.js";
import { Orchestrator, explainDecision, RunState } from "../agents/orchestrator.js";
import { runDoctor } from "../agents/doctor.js";
import { generateCi } from "../agents/ci.js";
import { parseK6Summary } from "../agents/result-analyzer.js";
import { compareResults } from "../agents/regression.js";
import { resolvePersona } from "../personas/index.js";
import { FrameworkError } from "../utils/errors.js";
import { writeText } from "../utils/fs.js";
import { TestType } from "../models/schemas.js";
import { markdown, coverageMatrix } from "../reporters/index.js";
import { readFileSync } from "node:fs";
import { analyzeAuthentication } from "../agents/authentication.js";
import { listBaselines, loadBaseline, saveBaseline } from "../store/baselines.js";
import { observabilityCompose } from "../observability/outputs.js";

const program = new Command();

program
  .name("k6-agent")
  .description("AI-powered k6 performance engineering agent")
  .version("0.2.0")
  .option("--persona <name>", "qa | performance-engineer | developer | devops | pm")
  .option("--verbose", "verbose logging")
  .option("--debug", "debug logging")
  .option("--trace", "trace logging")
  .option("--quiet", "quiet logging")
  .option("--config <path>", "config file")
  .option("--provider <name>", "ai provider override")
  .option("--yes", "confirm safety prompts")
  .option("--force", "override review FAIL and safety caps")
  .option("--dry-run", "print the plan without executing k6");

function ctx(opts: ReturnType<typeof program.opts>) {
  const config = loadConfig(opts.config as string | undefined);
  if (opts.provider) {
    config.ai.provider = opts.provider as typeof config.ai.provider;
  }
  const level: LogLevel = opts.trace
    ? "trace"
    : opts.debug
      ? "debug"
      : opts.verbose
        ? "verbose"
        : opts.quiet
          ? "quiet"
          : "normal";
  const logger = new Logger(level);
  const llm = createLLMProvider(config);
  const persona = resolvePersona(opts.persona as string | undefined);
  const orch = new Orchestrator(config, logger, llm, persona);
  return { config, logger, orch, persona, yes: Boolean(opts.yes), force: Boolean(opts.force), dryRun: Boolean(opts.dryRun) };
}

program
  .command("init")
  .description("Interactive project setup")
  .action(async () => {
    const answers = await prompts([
      {
        type: "select",
        name: "source",
        message: "Input source?",
        choices: [
          { title: "OpenAPI", value: "openapi" },
          { title: "Postman", value: "postman" },
          { title: "cURL", value: "curl" },
          { title: "HAR", value: "har" },
          { title: "Existing k6", value: "k6" },
        ],
      },
      { type: "text", name: "path", message: "Path to input file?" },
      {
        type: "select",
        name: "testType",
        message: "Test type?",
        choices: ["smoke", "load", "stress", "spike", "soak", "custom"].map((v) => ({
          title: v,
          value: v,
        })),
      },
      {
        type: "select",
        name: "environment",
        message: "Target environment?",
        choices: ["dev", "test", "uat", "staging", "production"].map((v) => ({ title: v, value: v })),
      },
      {
        type: "select",
        name: "rate",
        message: "Target traffic?",
        choices: [
          { title: "10 req/s", value: 10 },
          { title: "50 req/s", value: 50 },
          { title: "100 req/s", value: 100 },
        ],
      },
      {
        type: "select",
        name: "report",
        message: "Report?",
        choices: [
          { title: "HTML", value: "html" },
          { title: "Markdown", value: "markdown" },
          { title: "JSON", value: "json" },
          { title: "All", value: "all" },
        ],
      },
      {
        type: "select",
        name: "ci",
        message: "Generate CI?",
        choices: [
          { title: "GitHub Actions", value: "github" },
          { title: "Jenkins", value: "jenkins" },
          { title: "GitLab", value: "gitlab" },
          { title: "None", value: "none" },
        ],
      },
    ]);
    const { orch, yes, force } = ctx(program.opts());
    banner();
    orch.generate(answers.path, {
      testType: answers.testType,
      rate: answers.rate,
      environment: answers.environment,
      yes: yes || answers.environment !== "production",
      force,
      persistDecisions: true,
    });
    if (answers.ci && answers.ci !== "none") {
      const file = generateCi(answers.ci);
      writeText(file.path, file.contents);
      console.log(`Wrote ${file.path}`);
    }
    console.log(pc.green("Initialized generated-tests/. Next: k6-agent review ./generated-tests"));
  });

program
  .command("analyze")
  .argument("<input>", "OpenAPI, Postman, cURL, HAR, or k6 file")
  .option("--matrix", "print coverage matrix")
  .action((input: string, cmd: { matrix?: boolean }) => {
    const { orch } = ctx(program.opts());
    const state = orch.analyze(input);
    console.log(
      JSON.stringify(
        {
          title: state.apiModel?.source.title,
          endpoints: state.apiModel?.endpoints.length,
          auth: analyzeAuthentication(state.apiModel!),
          workflows: state.workflows?.map((w) => w.name),
          coverage: state.coverage,
          warnings: state.apiModel?.warnings,
          unsupported: state.apiModel?.unsupported,
        },
        null,
        2,
      ),
    );
    if (cmd.matrix && state.coverage) {
      console.log(coverageMatrix(state.coverage).markdown);
    }
  });

program
  .command("generate")
  .argument("<input>")
  .option("--type <testType>", "smoke|load|stress|spike|soak|breakpoint|custom", "load")
  .option("--out <dir>", "output directory", "generated-tests")
  .option("--include-destructive", "include DELETE endpoints")
  .option("--rate <n>", "arrival rate", (v) => Number(v))
  .option("--duration <d>", "duration")
  .option("--p95 <ms>", "SLA p95 milliseconds", (v) => Number(v))
  .option("--lang <lang>", "js|ts", "js")
  .action((input: string, cmd: Record<string, unknown>) => {
    const { orch, yes, force } = ctx(program.opts());
    banner();
    const state = orch.generate(input, {
      testType: cmd.type as TestType,
      outDir: cmd.out as string,
      includeDestructive: Boolean(cmd.includeDestructive),
      rate: cmd.rate as number | undefined,
      duration: cmd.duration as string | undefined,
      p95Ms: cmd.p95 as number | undefined,
      lang: cmd.lang === "ts" ? "ts" : "js",
      yes,
      force,
      persistDecisions: true,
    });
    printSteps(state.apiModel?.endpoints.length ?? 0, state.workflows?.length ?? 0, state.review?.verdict ?? "PASS");
  });

program
  .command("review")
  .argument("<path>")
  .action((path: string) => {
    const { orch } = ctx(program.opts());
    const result = orch.review(path);
    console.log(JSON.stringify(result, null, 2));
    if (result.verdict === "FAIL") process.exitCode = 1;
  });

program
  .command("run")
  .argument("<script>")
  .option("--test <type>", "test type", "load")
  .option("--env <kv...>", "KEY=VALUE pairs")
  .option("--report <formats>", "console,json,markdown,html,junit,csv,github,all", "html,markdown,json")
  .option("--docker", "run via grafana/k6 docker image")
  .option("--environment <name>", "dev|test|uat|staging|production", "dev")
  .option("--compare-baseline <name>", "compare against a named baseline")
  .option("--no-save-baseline", "do not persist this run as latest baseline")
  .action(async (script: string, cmd: Record<string, unknown>) => {
    const { orch, yes, force, dryRun } = ctx(program.opts());
    const extraEnv: Record<string, string> = {};
    const envArgs = (cmd.env as string[] | undefined) ?? [];
    for (const pair of envArgs) {
      const idx = pair.indexOf("=");
      if (idx > 0) extraEnv[pair.slice(0, idx)] = pair.slice(idx + 1);
    }
    const state = await orch.execute(script, {
      testType: cmd.test as TestType,
      extraEnv,
      reports: cmd.report as string,
      docker: Boolean(cmd.docker),
      environment: cmd.environment as string,
      yes,
      force,
      dryRun,
      compareBaseline: cmd.compareBaseline as string | undefined,
      saveBaseline: cmd.saveBaseline !== false,
    });
    if (state.analysis) {
      console.log(markdown(state.results!, state.analysis, state.coverage));
    }
  });

program
  .command("report")
  .argument("<summary>")
  .option("--format <formats>", "report formats", "html,markdown,json")
  .action((summary: string, cmd: { format?: string }) => {
    const { orch } = ctx(program.opts());
    const files = orch.reportFromSummary(summary, cmd.format ?? "html");
    console.log(files.join("\n"));
  });

program
  .command("compare")
  .argument("<current>")
  .argument("<baseline>")
  .option("--tolerance <pct>", "percent", (v) => Number(v), 10)
  .action((current: string, baseline: string, cmd: { tolerance: number }) => {
    const curr = parseK6Summary(current);
    const base = parseK6Summary(baseline);
    const result = compareResults(curr, base, cmd.tolerance);
    console.log(JSON.stringify(result, null, 2));
    if (result.regressed) process.exitCode = 1;
  });

const baselineCmd = program.command("baseline").description("Historical result baselines");
baselineCmd
  .command("save")
  .argument("<summary>", "k6 summary JSON")
  .option("--name <name>", "baseline name", "latest")
  .action((summary: string, cmd: { name: string }) => {
    const { config } = ctx(program.opts());
    const results = parseK6Summary(summary);
    const path = saveBaseline(results, cmd.name, config.baselines.directory);
    console.log(`Saved baseline ${cmd.name} -> ${path}`);
  });
baselineCmd
  .command("list")
  .action(() => {
    const { config } = ctx(program.opts());
    const rows = listBaselines(config.baselines.directory);
    if (rows.length === 0) {
      console.log("No baselines saved yet.");
      return;
    }
    for (const row of rows) {
      console.log(`${row.name}\t${row.savedAt}`);
    }
  });
baselineCmd
  .command("show")
  .argument("[name]", "baseline name", "latest")
  .action((name: string) => {
    const { config } = ctx(program.opts());
    const record = loadBaseline(name, config.baselines.directory);
    console.log(JSON.stringify(record, null, 2));
  });

const observability = program.command("observability").description("Optional Grafana/Influx helpers (not required)");
observability
  .command("compose")
  .action(() => {
    writeText("docker-compose.observability.yml", observabilityCompose());
    console.log("Wrote docker-compose.observability.yml (optional InfluxDB + Grafana).");
    console.log("Set observability.influxdbUrl in k6-agent.yaml, then k6-agent run will pass --out influxdb=...");
  });

const ci = program.command("ci").description("CI/CD helpers");
ci.command("generate")
  .argument("<provider>", "github|jenkins|gitlab")
  .action((provider: string) => {
    const file = generateCi(provider as "github" | "jenkins" | "gitlab");
    writeText(file.path, file.contents);
    console.log(`Wrote ${file.path}`);
  });

program
  .command("doctor")
  .action(() => {
    const { config } = ctx(program.opts());
    const checks = runDoctor(config);
    for (const c of checks) {
      const mark = c.ok && !c.warn ? pc.green("✓") : c.warn ? pc.yellow("⚠") : pc.red("✗");
      console.log(`${mark} ${c.name}: ${c.detail}`);
    }
    if (checks.some((c) => !c.ok)) process.exitCode = 1;
  });

program
  .command("config")
  .action(() => {
    const { config } = ctx(program.opts());
    const copy = structuredClone(config);
    if (copy.ai.apiKey) copy.ai.apiKey = "********";
    console.log(JSON.stringify(copy, null, 2));
  });

program
  .command("agent")
  .argument("<name>")
  .description("Show agent mission")
  .action((name: string) => {
    console.log(`Agent "${name}" is implemented in src/agents and .cursor/agents/${name}.md`);
  });

program
  .command("full-test")
  .argument("<input>")
  .option("--type <testType>", "test type", "smoke")
  .option("--out <dir>", "output directory", "generated-tests")
  .option("--report <formats>", "formats", "html,markdown,json")
  .option("--environment <name>", "environment", "dev")
  .option("--skip-run", "generate and review only")
  .option("--lang <lang>", "js|ts", "js")
  .action(async (input: string, cmd: Record<string, unknown>) => {
    const { orch, yes, force, dryRun } = ctx(program.opts());
    banner();
    step(1, 10, "Detecting input");
    const generated = orch.generate(input, {
      testType: cmd.type as TestType,
      outDir: cmd.out as string,
      lang: cmd.lang === "ts" ? "ts" : "js",
      yes,
      force,
      persistDecisions: true,
    });
    step(2, 10, "Analyzing API");
    step(3, 10, "Analyzing authentication");
    step(4, 10, "Discovering workflows");
    step(5, 10, "Designing performance test");
    step(6, 10, "Generating k6");
    step(7, 10, "Reviewing tests");
    if (generated.review?.verdict === "FAIL" && !force) {
      console.log(pc.red("RESULT: REVIEW FAIL"));
      process.exitCode = 1;
      return;
    }
    if (cmd.skipRun || dryRun) {
      step(8, 10, "Executing k6 (skipped)");
      step(9, 10, "Analyzing results (skipped)");
      step(10, 10, "Generating report (skipped)");
      return;
    }
    const type = (cmd.type as string) === "custom" ? "load" : (cmd.type as string);
    const ext = cmd.lang === "ts" ? "ts" : "js";
    const script = `${cmd.out}/${type}/main.${ext}`;
    step(8, 10, "Executing k6");
    try {
      const executed = await orch.execute(script, {
        testType: cmd.type as TestType,
        reports: cmd.report as string,
        environment: cmd.environment as string,
        yes,
        force,
      });
      step(9, 10, "Analyzing results");
      step(10, 10, "Generating report");
      const p95 = executed.results?.metrics.http_req_duration?.p95;
      console.log("");
      console.log(`RESULT: ${executed.analysis?.overall ?? "UNKNOWN"}`);
      console.log(`p95: ${p95 ?? "n/a"}ms`);
      console.log(`Reports:\n${(executed.reports ?? []).join("\n")}`);
    } catch (error) {
      if (error instanceof FrameworkError && error.code === "K6_NOT_FOUND") {
        console.log(pc.yellow("k6 is not installed. Generated tests are ready. Install k6 or use --docker."));
        process.exitCode = 0;
        return;
      }
      throw error;
    }
  });

program
  .command("explain")
  .argument("<question...>")
  .action((question: string[]) => {
    ctx(program.opts());
    let state: RunState;
    try {
      state = JSON.parse(readFileSync(".agent/state.json", "utf8")) as RunState;
    } catch {
      console.log("No .agent/state.json. Run generate first.");
      return;
    }
    console.log(explainDecision(state, question.join(" ")));
  });

program.hook("postAction", () => undefined);

program.parseAsync(process.argv).catch((error: unknown) => {
  if (error instanceof FrameworkError) {
    console.error(pc.red(error.message));
    if (error.hint) console.error("\n" + error.hint);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});

function banner() {
  console.log(pc.cyan("╭────────────────────────────────────────╮"));
  console.log(pc.cyan("│       AI K6 Performance Agent          │"));
  console.log(pc.cyan("╰────────────────────────────────────────╯"));
}

function step(n: number, total: number, label: string) {
  console.log(pc.green(`[${n}/${total}] ${label.padEnd(28, ".")} ✓`));
}

function printSteps(endpoints: number, workflows: number, review: string) {
  console.log(`✓ API analyzed`);
  console.log(`✓ Authentication detected`);
  console.log(`✓ ${endpoints} endpoints discovered`);
  console.log(`✓ ${workflows} workflows identified`);
  console.log(`✓ Load scenario designed`);
  console.log(`✓ k6 tests generated`);
  console.log(`✓ Thresholds generated`);
  console.log(`✓ Review ${review}`);
}

