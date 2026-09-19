import { describe, expect, it } from "vitest";
import { parseOpenApi, parsePostman, parseCurl, parseK6 } from "../../src/parsers/index.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("openapi parser", () => {
  it("parses petstore and resolves Product $ref", () => {
    const yaml = readFileSync(resolve("examples/openapi/petstore.yaml"), "utf8");
    const model = parseOpenApi(yaml, "petstore.yaml");
    expect(model.endpoints.length).toBeGreaterThanOrEqual(5);
    const create = model.endpoints.find((e) => e.method === "POST" && e.path === "/products");
    expect(create?.requestBody?.schema).toBeTruthy();
    expect(model.authentication[0]?.type).toBe("bearer");
    expect(create?.requestBody?.schema).toMatchObject({ type: "object" });
  });

  it("parses swagger 2 host/basePath", () => {
    const model = parseOpenApi(
      JSON.stringify({
        swagger: "2.0",
        info: { title: "s", version: "1" },
        host: "api.example.com",
        basePath: "/v1",
        schemes: ["https"],
        paths: { "/ping": { get: { responses: { 200: { description: "ok" } } } } },
      }),
      "s.json",
    );
    expect(model.servers[0]).toBe("https://api.example.com/v1");
  });
});

describe("postman parser", () => {
  it("maps folders, variables, and reports unconverted scripts", () => {
    const json = readFileSync(resolve("examples/postman/sample-collection.json"), "utf8");
    const model = parsePostman(json, "collection.json");
    expect(model.endpoints.some((e) => e.method === "POST")).toBe(true);
    expect(model.unsupported.some((u) => u.includes("script"))).toBe(true);
    expect(model.authentication[0]?.envVars).toContain("API_TOKEN");
  });
});

describe("curl parser", () => {
  it("parses multi-command sample", () => {
    const sh = readFileSync(resolve("examples/curl/sample.sh"), "utf8");
    const model = parseCurl(sh, "sample.sh");
    expect(model.endpoints.length).toBe(3);
    expect(model.endpoints.some((e) => e.authentication === "bearer")).toBe(true);
  });
});

describe("k6 parser", () => {
  it("extracts http calls without rewriting", () => {
    const model = parseK6(
      `import http from 'k6/http';
       export default function () { http.get('https://example.com/items'); }`,
      "t.js",
    );
    expect(model.endpoints[0]?.path).toBe("/items");
    expect(model.warnings[0]).toMatch(/not rewritten/i);
  });
});
