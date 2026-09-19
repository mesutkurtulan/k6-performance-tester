import { describe, expect, it } from "vitest";
import { parseInput } from "../../src/parsers/index.js";
import { designStrategy } from "../../src/agents/performance-strategist.js";
import { generateK6 } from "../../src/agents/k6-generator.js";
import { discoverWorkflows } from "../../src/agents/workflow.js";
import { AppConfigSchema } from "../../src/config/schema.js";
import { writeReports } from "../../src/reporters/index.js";
import { analyzeResults } from "../../src/agents/performance-analyst.js";
import { parseK6Summary } from "../../src/agents/result-analyzer.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const config = AppConfigSchema.parse({});

describe("openapi to k6", () => {
  it("generates executable-looking modules from petstore", () => {
    const model = parseInput("examples/openapi/petstore.yaml");
    const workflows = discoverWorkflows(model);
    expect(workflows.some((w) => w.name.includes("products"))).toBe(true);
    const strategy = designStrategy("load", config);
    const files = generateK6(model, strategy, workflows, {
      outDir: "generated-tests",
      includeDestructive: false,
      includeNegative: true,
    });
    const main = files.find((f) => f.path.endsWith("load/main.js"))?.contents ?? "";
    expect(main).toContain("export const options");
    expect(main).toContain("thresholds");
    expect(main).not.toContain("real-secret");
    expect(main).toContain("__ENV");
    const auth = files.find((f) => f.path.endsWith("auth.js"))?.contents ?? "";
    expect(auth).toContain("API_TOKEN");
    expect(auth).not.toMatch(/Bearer [A-Za-z0-9]{20,}/);
  });
});

describe("postman and curl to model", () => {
  it("normalizes both inputs", () => {
    const p = parseInput("examples/postman/sample-collection.json");
    const c = parseInput("examples/curl/sample.sh");
    expect(p.source.type).toBe("postman");
    expect(c.source.type).toBe("curl");
    expect(p.endpoints.length).toBeGreaterThan(0);
  });
});

describe("reports", () => {
  it("writes html json markdown", () => {
    const dir = mkdtempSync(join(tmpdir(), "rep-"));
    const results = parseK6Summary(
      JSON.stringify({
        metrics: {
          http_req_duration: { values: { "p(95)": 42 } },
          http_req_failed: { rate: 0 },
        },
      }),
    );
    const analysis = analyzeResults(results, "pm");
    const files = writeReports(dir, results, analysis, undefined, ["html", "json", "markdown"]);
    expect(files.length).toBe(3);
    expect(readFileSync(files[0], "utf8").length).toBeGreaterThan(10);
    expect(analysis.personaView).toMatch(/Product view/);
  });
});
