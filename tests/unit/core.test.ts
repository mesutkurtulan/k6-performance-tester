import { describe, expect, it } from "vitest";
import { findHardcodedSecrets, maskSecrets } from "../../src/utils/secrets.js";
import { parseDurationMs } from "../../src/utils/duration.js";
import { designStrategy } from "../../src/agents/performance-strategist.js";
import { AppConfigSchema } from "../../src/config/schema.js";
import { compareResults } from "../../src/agents/regression.js";
import { parseK6Summary } from "../../src/agents/result-analyzer.js";
import { reviewTests } from "../../src/agents/test-reviewer.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const config = AppConfigSchema.parse({});

describe("secrets", () => {
  it("masks authorization headers", () => {
    expect(maskSecrets("Authorization: Bearer abcdefghijklmnop")).toContain("********");
  });
  it("detects hardcoded tokens", () => {
    expect(findHardcodedSecrets('const token = "supersecrettokenvalue"').length).toBeGreaterThan(0);
  });
});

describe("duration", () => {
  it("parses units", () => {
    expect(parseDurationMs("5m")).toBe(300000);
  });
});

describe("strategy", () => {
  it("documents assumptions for load", () => {
    const s = designStrategy("load", config, { rate: 10, duration: "1m" });
    expect(s.scenarios[0]?.executor).toBe("constant-arrival-rate");
    expect(s.assumptions.length).toBeGreaterThan(0);
    expect(s.thresholds.every((t) => t.reason)).toBe(true);
  });
});

describe("results", () => {
  it("normalizes summary export", () => {
    const summary = {
      metrics: {
        http_req_duration: { values: { "p(95)": 120, "p(99)": 200 }, min: 10, max: 300 },
        http_req_failed: { rate: 0.001, thresholds: { "rate<0.01": { ok: true } } },
        http_reqs: { rate: 10, count: 100 },
      },
    };
    const n = parseK6Summary(JSON.stringify(summary));
    expect(n.metrics.http_req_duration?.p95).toBe(120);
    expect(n.passed).toBe(true);
  });
});

describe("regression", () => {
  it("flags latency regression beyond tolerance", () => {
    const mk = (p95: number) =>
      parseK6Summary(
        JSON.stringify({
          metrics: { http_req_duration: { values: { "p(95)": p95 } } },
        }),
      );
    const r = compareResults(mk(200), mk(100), 10);
    expect(r.regressed).toBe(true);
  });
});

describe("reviewer", () => {
  it("fails on hardcoded secrets", () => {
    const dir = mkdtempSync(join(tmpdir(), "rev-"));
    writeFileSync(join(dir, "t.js"), "const token = \"supersecrettokenvalue\";\nexport const options = { thresholds: { a: ['p(95)<1'] } }; check();");
    const r = reviewTests(dir);
    expect(r.verdict).toBe("FAIL");
  });
});
