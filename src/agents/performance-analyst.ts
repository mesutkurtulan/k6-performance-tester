import {
  NormalizedResult,
  PerformanceAnalysis,
  PerformanceAnalysisSchema,
} from "../models/schemas.js";
import { PersonaId, renderPersonaView } from "../personas/index.js";

export function analyzeResults(
  results: NormalizedResult,
  persona: PersonaId = "performance-engineer",
): PerformanceAnalysis {
  const duration = results.metrics.http_req_duration;
  const failed = results.metrics.http_req_failed;
  const p95 = duration?.p95;
  const errorRate = failed?.rate ?? failed?.value;
  const overall: PerformanceAnalysis["overall"] = results.passed ? "PASS" : "FAIL";

  const observations: string[] = [];
  if (p95 !== undefined) observations.push(`Observed p95 latency: ${p95.toFixed(2)} ms.`);
  if (errorRate !== undefined) observations.push(`Observed failed-request rate: ${errorRate}.`);
  const iters = results.metrics.iterations?.count;
  if (iters !== undefined) observations.push(`Completed iterations: ${iters}.`);

  const likely: string[] = [];
  const possible: string[] = [];
  const unknown: string[] = [
    "Root cause cannot be claimed from k6 client metrics alone (no server traces).",
  ];

  let primaryIssue: string | undefined;
  if (!results.passed) {
    const failedTh = results.thresholds.filter((t) => !t.passed).map((t) => t.name);
    primaryIssue = failedTh[0] ?? "One or more thresholds failed.";
    likely.push("Investigate the slowest or most error-prone tagged endpoint in the k6 summary.");
    possible.push("Downstream dependency latency.");
    possible.push("Connection pool or CPU saturation on the target.");
  }

  const summary =
    overall === "PASS"
      ? "Thresholds passed for this run. Treat this as evidence for the tested profile only."
      : `Overall result: FAILED. ${primaryIssue ?? ""}`.trim();

  const analysis: PerformanceAnalysis = {
    overall,
    summary,
    primaryIssue,
    observations,
    likely,
    possible,
    unknown,
    recommendations:
      overall === "FAIL"
        ? [
            "Compare against a baseline with k6-agent compare.",
            "Inspect endpoint tags and error bodies (without logging secrets).",
            "Re-run a smoke test to separate functional breakage from load-induced failure.",
          ]
        : ["Store this summary as a baseline if the environment is stable."],
    confidence: results.passed ? "medium" : "low",
  };
  analysis.personaView = renderPersonaView(persona, analysis, results);
  return PerformanceAnalysisSchema.parse(analysis);
}
