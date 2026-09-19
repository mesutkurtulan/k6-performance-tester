import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NormalizedResult, NormalizedResultSchema } from "../models/schemas.js";
import { FrameworkError } from "../utils/errors.js";

export interface BaselineRecord {
  name: string;
  savedAt: string;
  results: NormalizedResult;
}

export function baselineDir(root = process.cwd(), configured = ".agent/baselines"): string {
  return join(root, configured);
}

export function saveBaseline(
  results: NormalizedResult,
  name = "latest",
  dir = baselineDir(),
): string {
  mkdirSync(dir, { recursive: true });
  const record: BaselineRecord = {
    name,
    savedAt: new Date().toISOString(),
    results,
  };
  const path = join(dir, `${sanitize(name)}.json`);
  writeFileSync(path, JSON.stringify(record, null, 2));
  writeFileSync(join(dir, "latest.json"), JSON.stringify(record, null, 2));
  const history = join(dir, "history.jsonl");
  writeFileSync(history, `${JSON.stringify({ name, savedAt: record.savedAt, path })}\n`, {
    flag: "a",
  });
  return path;
}

export function loadBaseline(name = "latest", dir = baselineDir()): BaselineRecord {
  const path = join(dir, `${sanitize(name)}.json`);
  if (!existsSync(path)) {
    throw new FrameworkError(
      "BASELINE_MISSING",
      `No baseline named "${name}" in ${dir}.`,
      "Run a test, then: k6-agent baseline save <summary.json> --name " + name,
    );
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as BaselineRecord;
  return {
    name: raw.name,
    savedAt: raw.savedAt,
    results: NormalizedResultSchema.parse(raw.results),
  };
}

export function listBaselines(dir = baselineDir()): BaselineRecord[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as BaselineRecord);
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
