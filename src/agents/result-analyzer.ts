import { readFileSync } from "node:fs";
import { NormalizedResult, NormalizedResultSchema } from "../models/schemas.js";

export function parseK6Summary(pathOrJson: string): NormalizedResult {
  const raw = pathOrJson.trim().startsWith("{") ? pathOrJson : readFileSync(pathOrJson, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const normalized = asNormalized(parsed);
  if (normalized) return normalized;

  const json = isRecord(parsed)
    ? (parsed as { metrics?: Record<string, Record<string, unknown>>; root_group?: unknown })
    : {};
  const metrics: NormalizedResult["metrics"] = {};
  for (const [name, value] of Object.entries(json.metrics ?? {})) {
    metrics[name] = {
      count: num(value.count),
      rate: num(value.rate),
      min: num(value.min ?? asRecord(value.values)?.min),
      max: num(value.max ?? asRecord(value.values)?.max),
      avg: num(value.avg ?? asRecord(value.values)?.avg),
      p50: num(asRecord(value.percentiles)?.["p(50)"] ?? asRecord(value.values)?.["p(50)"]),
      p90: num(asRecord(value.percentiles)?.["p(90)"] ?? asRecord(value.values)?.["p(90)"]),
      p95: num(asRecord(value.percentiles)?.["p(95)"] ?? asRecord(value.values)?.["p(95)"]),
      p99: num(asRecord(value.percentiles)?.["p(99)"] ?? asRecord(value.values)?.["p(99)"]),
      value: num(value.value),
      passes: num(value.passes),
      fails: num(value.fails),
    };
  }

  const thresholds: NormalizedResult["thresholds"] = [];
  for (const [name, value] of Object.entries(json.metrics ?? {})) {
    const th = value.thresholds;
    if (th && typeof th === "object") {
      for (const [expr, ok] of Object.entries(th as Record<string, unknown>)) {
        const passed = isRecord(ok) ? ok.ok !== false : Boolean(ok);
        thresholds.push({ name: `${name}{${expr}}`, passed });
      }
    }
  }

  const passed = thresholds.length === 0 ? true : thresholds.every((t) => t.passed);
  return NormalizedResultSchema.parse({
    metrics,
    thresholds,
    rootGroup: json.root_group,
    passed,
    rawPath: pathOrJson.trim().startsWith("{") ? undefined : pathOrJson,
  });
}

function asNormalized(parsed: unknown): NormalizedResult | undefined {
  if (!isRecord(parsed)) return undefined;
  if (isRecord(parsed.results) && isRecord(parsed.results.metrics) && Array.isArray(parsed.results.thresholds)) {
    return NormalizedResultSchema.parse(parsed.results);
  }
  if (isRecord(parsed.metrics) && Array.isArray(parsed.thresholds) && !looksLikeK6Raw(parsed.metrics)) {
    const parsedNorm = NormalizedResultSchema.safeParse(parsed);
    if (parsedNorm.success) return parsedNorm.data;
  }
  return undefined;
}

function looksLikeK6Raw(metrics: Record<string, unknown>): boolean {
  const first = Object.values(metrics)[0];
  return isRecord(first) && isRecord(first.values);
}

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return isRecord(v) ? v : undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
