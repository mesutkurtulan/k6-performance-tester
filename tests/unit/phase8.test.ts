import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseHar, parseInput, parseOpenApi } from "../../src/parsers/index.js";
import { readFileSync } from "node:fs";
import { discoverWorkflows } from "../../src/agents/workflow.js";
import { pointerToVar } from "../../src/agents/openapi-links.js";
import { generateK6 } from "../../src/agents/k6-generator.js";
import { designStrategy } from "../../src/agents/performance-strategist.js";
import { AppConfigSchema } from "../../src/config/schema.js";
import { saveBaseline, loadBaseline, listBaselines } from "../../src/store/baselines.js";
import { parseK6Summary } from "../../src/agents/result-analyzer.js";
import { observabilityArgs } from "../../src/observability/outputs.js";

describe("HAR parser", () => {
  it("normalizes browser capture entries", () => {
    const har = readFileSync("examples/har/sample.har", "utf8");
    const model = parseHar(har, "sample.har");
    expect(model.source.type).toBe("har");
    expect(model.endpoints).toHaveLength(2);
    expect(model.endpoints.some((e) => e.method === "POST")).toBe(true);
    expect(model.authentication[0]?.type).toBe("bearer");
  });

  it("is auto-detected from .har files", () => {
    expect(parseInput("examples/har/sample.har").source.type).toBe("har");
  });
});

describe("OpenAPI links", () => {
  it("maps $response.body pointers and creates link workflows", () => {
    expect(pointerToVar("$response.body#/id")).toBe("id");
    const yaml = readFileSync("examples/openapi/petstore.yaml", "utf8");
    const model = parseOpenApi(yaml, "petstore.yaml");
    const create = model.endpoints.find((e) => e.operationId === "createProduct");
    expect(create?.links[0]?.operationId).toBe("getProduct");
    const wfs = discoverWorkflows(model);
    expect(wfs.some((w) => w.name === "link-GetProductById")).toBe(true);
    expect(wfs.some((w) => w.correlation.some((c) => c.includes("$response.body#/id")))).toBe(true);
  });
});

describe("k6 TypeScript output", () => {
  it("emits .ts modules and tsconfig", () => {
    const model = parseInput("examples/openapi/petstore.yaml");
    const files = generateK6(model, designStrategy("smoke", AppConfigSchema.parse({})), [], {
      outDir: "generated-tests",
      includeDestructive: false,
      includeNegative: false,
      lang: "ts",
    });
    expect(files.some((f) => f.path.endsWith("shared/http.ts"))).toBe(true);
    expect(files.some((f) => f.path.endsWith("tsconfig.json"))).toBe(true);
    expect(files.some((f) => f.path.endsWith("k6-env.d.ts"))).toBe(true);
    const tsconfig = files.find((f) => f.path.endsWith("tsconfig.json"))?.contents ?? "";
    expect(tsconfig).not.toContain('"k6"');
    expect(tsconfig).toContain("allowImportingTsExtensions");
    const http = files.find((f) => f.path.endsWith("http.ts"))?.contents ?? "";
    expect(http).toContain("method: string");
  });
});

describe("baseline store", () => {
  it("saves and reloads a summary", () => {
    const dir = mkdtempSync(join(tmpdir(), "bl-"));
    const results = parseK6Summary(
      JSON.stringify({ metrics: { http_req_duration: { values: { "p(95)": 10 } } } }),
    );
    saveBaseline(results, "dev", dir);
    const loaded = loadBaseline("dev", dir);
    expect(loaded.results.metrics.http_req_duration?.p95).toBe(10);
    expect(listBaselines(dir).length).toBeGreaterThanOrEqual(1);
  });
});

describe("observability args", () => {
  it("is empty unless configured", () => {
    expect(observabilityArgs(AppConfigSchema.parse({}))).toEqual([]);
    expect(
      observabilityArgs(
        AppConfigSchema.parse({ observability: { influxdbUrl: "http://127.0.0.1:8086/k6" } }),
      ),
    ).toEqual(["--out", "influxdb=http://127.0.0.1:8086/k6"]);
  });
});
