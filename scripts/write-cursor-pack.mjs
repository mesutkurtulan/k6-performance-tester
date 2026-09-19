import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

const agentTpl = (name, mission, extras = "") => `---
name: ${name}
description: ${mission}
---

# ${name}

## Role
Specialist agent in the AI K6 Performance Agent framework.

## Mission
${mission}

## Responsibilities
- Consume typed RunState
- Produce schema-validated output
- Record decisions with reasons
- Never log secrets

## Inputs
Normalized API model, config, optional LLM provider, persona.

## Outputs
Typed artifacts documented in ARCHITECTURE.md.

## Tools
Deterministic parsers/generators in src/. Optional LLMProvider.

## Constraints
Do not invent SLA values. Do not hard-code credentials. Do not execute production tests without confirmation.

## Failure conditions
Invalid input, schema validation failure after retry, safety limit exceeded.

## Validation rules
Zod schemas in src/models/schemas.ts. Invalid AI JSON is retried, repaired, or failed.

## Examples
See README.md and examples/.

${extras}
`;

const agents = {
  "orchestrator.md": ["orchestrator-agent", "Coordinate the performance testing workflow; delegate, never implement every task."],
  "api-analyzer.md": ["api-analyzer-agent", "Parse OpenAPI/Postman/cURL/k6 into a normalized API model."],
  "authentication.md": ["authentication-agent", "Detect auth schemes and map them to environment variables."],
  "workflow.md": ["workflow-agent", "Discover CRUD and business workflows plus correlation variables."],
  "performance-strategist.md": ["performance-strategist-agent", "Design smoke/load/stress/spike/soak/breakpoint scenarios with assumptions."],
  "k6-generator.md": ["k6-generator-agent", "Generate maintainable k6 tests from the normalized model only."],
  "test-data.md": ["test-data-agent", "Create non-secret fixtures and environment-specific data files."],
  "threshold.md": ["threshold-agent", "Propose thresholds with source and reason; never label AI guesses as SLAs."],
  "test-reviewer.md": ["test-reviewer-agent", "Review generated tests with PASS/WARN/FAIL before execution."],
  "environment.md": ["environment-agent", "Resolve target environments and require confirmation for production."],
  "execution.md": ["execution-agent", "Run k6 locally or in Docker, capture summary export, enforce timeouts."],
  "result-analyzer.md": ["result-analyzer-agent", "Normalize k6 summary metrics into a common result model."],
  "performance-analyst.md": ["performance-analyst-agent", "Explain results using Observed/Likely/Possible/Unknown."],
  "regression.md": ["performance-regression-agent", "Compare current vs baseline with configurable tolerance."],
  "report.md": ["report-agent", "Emit console, JSON, Markdown, HTML, JUnit, CSV, and GitHub summaries."],
  "ci.md": ["ci-agent", "Generate GitHub Actions, Jenkins, and GitLab CI pipelines."],
};

for (const [file, [name, mission]] of Object.entries(agents)) {
  write(join(root, ".cursor/agents", file), agentTpl(name, mission));
}

const commands = {
  "analyze-api.md": ["analyze-api", "Parse the given API definition and print the normalized model, auth, workflows, and coverage."],
  "generate-k6.md": ["generate-k6", "Design a performance strategy and generate k6 tests from the input definition."],
  "design-performance-test.md": ["design-performance-test", "Choose executor, VUs/rate, duration, and thresholds with documented assumptions."],
  "review-k6.md": ["review-k6", "Statically review generated k6 for secrets, checks, thresholds, and safety."],
  "run-performance-test.md": ["run-performance-test", "Execute k6 with safety gates; support --dry-run."],
  "analyze-results.md": ["analyze-results", "Normalize k6 summary JSON and produce a persona-aware analysis."],
  "generate-report.md": ["generate-report", "Write HTML/Markdown/JSON/JUnit reports from a summary file."],
  "compare-results.md": ["compare-results", "Detect latency, throughput, error-rate, and threshold regressions."],
  "generate-ci.md": ["generate-ci", "Emit CI configuration for github, jenkins, or gitlab."],
  "full-performance-test.md": ["full-performance-test", "Analyze → Design → Generate → Review → Run → Analyze → Report."],
};

for (const [file, [name, body]] of Object.entries(commands)) {
  write(
    join(root, ".cursor/commands", file),
    `---
name: ${name}
description: ${body}
---

# /${name}

${body}

Use the k6-agent CLI when the repo is built:

\`\`\`bash
npx k6-agent --help
\`\`\`
`,
  );
}

const skills = [
  ["openapi-analysis", "Parse OpenAPI/Swagger documents into the normalized API model. Use when analyzing OpenAPI or Swagger files."],
  ["postman-analysis", "Parse Postman collections, map {{variables}} to __ENV, and report unconverted scripts."],
  ["curl-analysis", "Parse cURL commands including -X -H -d -u --url into endpoints."],
  ["api-normalization", "Ensure every input becomes NormalizedApiModel before generation."],
  ["authentication-analysis", "Detect bearer, oauth2, basic, apiKey, cookie, jwt and map to env vars."],
  ["workflow-discovery", "Find CRUD chains and correlation of path IDs across endpoints."],
  ["performance-test-design", "Select k6 executors and load profiles with explicit assumptions."],
  ["k6-generation", "Emit modular k6 JavaScript with checks, tags, thresholds, and shared auth."],
  ["k6-best-practices", "Prefer arrival-rate for RPS goals, tag endpoints, avoid hardcoded think times as SLAs."],
  ["test-data-generation", "Build fixtures from schemas/examples without secrets."],
  ["threshold-design", "Attach source and reason to every threshold; label AI values as recommendations."],
  ["performance-analysis", "Explain k6 metrics without claiming unaudited root causes."],
  ["regression-analysis", "Compare summaries using a tolerance percentage."],
  ["report-generation", "Produce CI-friendly HTML, Markdown, JSON, JUnit, CSV reports."],
  ["ci-generation", "Generate GitHub Actions, Jenkinsfile, or GitLab CI for k6-agent."],
  ["security-review", "Fail on hardcoded secrets and unmasked Authorization headers."],
  ["production-safety", "Require confirmation for production, DELETE, soak, and over-limit load."],
];

for (const [name, description] of skills) {
  write(
    join(root, ".cursor/skills", name, "SKILL.md"),
    `---
name: ${name}
description: ${description}
---

# ${name}

## Instructions
Follow ARCHITECTURE.md. Prefer deterministic code in src/ over free-form generation.

## Examples
See examples/ and tests/.
`,
  );
}

const personas = {
  "qa-engineer.md": ["QA Engineer", "test coverage, validation, functional correctness, negative cases, checks"],
  "performance-engineer.md": ["Performance Engineer", "latency, throughput, concurrency, load model, bottlenecks, capacity"],
  "developer.md": ["Developer", "endpoint behavior, error patterns, potential bottlenecks, implementation implications"],
  "devops-engineer.md": ["DevOps Engineer", "CPU, memory, network, scaling, containers, CI/CD, infrastructure"],
  "qa-lead.md": ["QA Lead", "residual risk, coverage gaps, excluded destructive tests, release gates"],
  "architect.md": ["Architect", "system boundaries, capacity claims, dependency risk, test strategy fit"],
  "product-manager.md": ["Product Manager", "SLA, user impact, business impact, release risk"],
};

for (const [file, [title, focus]] of Object.entries(personas)) {
  write(
    join(root, ".cursor/personas", file),
    `# ${title}

## Focus
${focus}

Rewrite analyses for this audience. Do not invent business metrics that were not measured.
`,
  );
}

const workflows = {
  "generate-test.md": "Detect source → analyze → strategy → generate k6 → review.",
  "full-test-cycle.md": "INPUT → analysis → auth → workflows → strategy → generate → data → thresholds → review → approval → execute → analyze → regress → report.",
  "performance-regression.md": "Load current and baseline summaries → compare with tolerance → report regressions.",
  "api-discovery.md": "Parse input → list endpoints, auth, pagination, CRUD, coverage matrix.",
  "ci-pipeline.md": "Generate CI spec → run smoke in pipeline → publish JUnit and GitHub summary.",
  "production-readiness.md": "Require --yes, exclude DELETE unless approved, cap VUs/rate, document risk.",
};

for (const [file, body] of Object.entries(workflows)) {
  write(join(root, ".cursor/workflows", file), `# ${file.replace(".md", "")}\n\n${body}\n`);
}

write(
  join(root, ".cursor/rules/framework.mdc"),
  `---
description: Core rules for AI K6 Performance Agent
alwaysApply: true
---

# Framework rules

- Deterministic parsing; optional AI for strategy and explanation only
- NormalizedApiModel is the only generator input
- No secrets in source, logs, fixtures, or LLM payloads
- Thresholds need source + reason
- Production/DELETE/high load need confirmation
`,
);

console.log("cursor pack written");
