import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockApi } from "../../src/mock-api/server.js";
import { Orchestrator } from "../../src/agents/orchestrator.js";
import { Logger } from "../../src/utils/logger.js";
import { AppConfigSchema } from "../../src/config/schema.js";
import { DisabledProvider } from "../../src/providers/llm/disabled.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reviewTests } from "../../src/agents/test-reviewer.js";

let close: () => Promise<void>;

beforeAll(async () => {
  const server = await startMockApi(0);
  close = server.close;
});

afterAll(async () => {
  await close();
});

describe("e2e generate", () => {
  it("analyzes, generates, and reviews without k6", () => {
    const out = mkdtempSync(join(tmpdir(), "k6e2e-"));
    const orch = new Orchestrator(
      AppConfigSchema.parse({}),
      new Logger("quiet"),
      new DisabledProvider(),
      "qa",
    );
    const state = orch.generate("examples/openapi/petstore.yaml", {
      testType: "smoke",
      outDir: out,
      yes: true,
    });
    expect(state.generatedTests?.length).toBeGreaterThan(3);
    const review = reviewTests(out);
    expect(review.verdict).not.toBe("FAIL");
  });
});
