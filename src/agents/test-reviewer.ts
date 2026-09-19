import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ReviewFindingSchema, ReviewResult, ReviewResultSchema } from "../models/schemas.js";
import { findHardcodedSecrets } from "../utils/secrets.js";

export function reviewTests(dir: string): ReviewResult {
  const files = collectJs(dir);
  const findings: Array<typeof ReviewFindingSchema._type> = [];

  if (files.length === 0) {
    findings.push({
      severity: "FAIL",
      code: "NO_TESTS",
      message: `No k6 JavaScript/TypeScript files found under ${dir}.`,
    });
  }

  for (const file of files) {
    const isHelper = file.includes(`${join("shared")}`) || file.endsWith("fixtures.json");
    if (isHelper) continue;
    const source = readFileSync(file, "utf8");
    const secrets = findHardcodedSecrets(source);
    for (const secret of secrets) {
      findings.push({
        severity: "FAIL",
        code: "HARDCODED_SECRET",
        message: `Possible hard-coded secret: ${secret}`,
        file,
      });
    }
    if (!source.includes("check(") && !source.includes("shared/http.js") && !source.includes("shared/http.ts")) {
      findings.push({
        severity: "WARN",
        code: "MISSING_CHECKS",
        message: "No checks() found.",
        file,
      });
    }
    if (!source.includes("thresholds") && /main\.(js|ts)$/.test(file)) {
      findings.push({
        severity: "FAIL",
        code: "MISSING_THRESHOLDS",
        message: "No thresholds configured.",
        file,
      });
    }
    if (!source.includes("tags") && !source.includes("endpoint:") && /main\.(js|ts)$/.test(file)) {
      findings.push({
        severity: "WARN",
        code: "MISSING_TAGS",
        message: "Requests should be tagged by endpoint.",
        file,
      });
    }
    if (source.includes("http.del") || /DELETE/.test(source)) {
      findings.push({
        severity: "WARN",
        code: "DESTRUCTIVE",
        message: "Script includes DELETE operations.",
        file,
      });
    }
  }

  const verdict = findings.some((f) => f.severity === "FAIL")
    ? "FAIL"
    : findings.some((f) => f.severity === "WARN")
      ? "WARN"
      : "PASS";

  return ReviewResultSchema.parse({ verdict, findings });
}

function collectJs(dir: string): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    let entries: string[] = [];
    try {
      entries = readdirSync(p);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(p, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (full.endsWith(".js") || full.endsWith(".ts")) out.push(full);
    }
  };
  walk(dir);
  return out;
}
