import { Coverage, NormalizedResult, PerformanceAnalysis } from "../models/schemas.js";
import { writeText } from "../utils/fs.js";
import { maskSecrets } from "../utils/secrets.js";

export type ReportFormat = "console" | "json" | "markdown" | "html" | "junit" | "csv" | "github";

export function parseFormats(value: string | undefined): ReportFormat[] {
  if (!value || value === "all") {
    return ["console", "json", "markdown", "html", "junit", "csv", "github"];
  }
  return value.split(",").map((s) => s.trim()) as ReportFormat[];
}

export function writeReports(
  destDir: string,
  results: NormalizedResult,
  analysis: PerformanceAnalysis,
  coverage?: Coverage,
  formats: ReportFormat[] = ["json", "markdown", "html"],
): string[] {
  const written: string[] = [];
  for (const format of formats) {
    if (format === "console") continue;
    const { path, contents } = renderReport(format, destDir, results, analysis, coverage);
    writeText(path, contents);
    written.push(path);
  }
  return written;
}

export function renderReport(
  format: ReportFormat,
  destDir: string,
  results: NormalizedResult,
  analysis: PerformanceAnalysis,
  coverage?: Coverage,
): { path: string; contents: string } {
  switch (format) {
    case "json":
      return {
        path: `${destDir}/report.json`,
        contents: maskSecrets(JSON.stringify({ results, analysis, coverage }, null, 2)),
      };
    case "markdown":
    case "github":
      return {
        path: format === "github" ? `${destDir}/github-summary.md` : `${destDir}/report.md`,
        contents: markdown(results, analysis, coverage),
      };
    case "html":
      return { path: `${destDir}/report.html`, contents: html(results, analysis, coverage) };
    case "junit":
      return { path: `${destDir}/junit.xml`, contents: junit(results, analysis) };
    case "csv":
      return { path: `${destDir}/metrics.csv`, contents: csv(results) };
    default:
      return { path: `${destDir}/report.txt`, contents: analysis.summary };
  }
}

export function markdown(
  results: NormalizedResult,
  analysis: PerformanceAnalysis,
  coverage?: Coverage,
): string {
  const p95 = results.metrics.http_req_duration?.p95;
  const err = results.metrics.http_req_failed?.rate;
  const rps = results.metrics.http_reqs?.rate;
  const lines = [
    "# Performance report",
    "",
    `**Result:** ${analysis.overall}`,
    "",
    analysis.summary,
    "",
    "## Metrics",
    "",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| p95 | ${p95 ?? "n/a"} ms |`,
    `| p99 | ${results.metrics.http_req_duration?.p99 ?? "n/a"} ms |`,
    `| Error rate | ${err ?? "n/a"} |`,
    `| Throughput | ${rps ?? "n/a"} req/s |`,
    "",
    "## Thresholds",
    "",
    ...results.thresholds.map((t) => `- ${t.passed ? "PASS" : "FAIL"} ${t.name}`),
    "",
    "## Observations",
    ...analysis.observations.map((o) => `- ${o}`),
    "",
    "### Likely",
    ...analysis.likely.map((o) => `- ${o}`),
    "",
    "### Possible",
    ...analysis.possible.map((o) => `- ${o}`),
    "",
    "### Unknown",
    ...analysis.unknown.map((o) => `- ${o}`),
    "",
    "## Recommendations",
    ...analysis.recommendations.map((o) => `- ${o}`),
    "",
    analysis.personaView ? `## Persona\n\n${analysis.personaView}\n` : "",
  ];
  if (coverage) {
    lines.push(
      "## Coverage",
      "",
      `Total endpoints: ${coverage.total}`,
      `Covered: ${coverage.covered}`,
      `Not covered: ${coverage.uncovered}`,
      "",
      ...Object.entries(coverage.byMethod).map(
        ([m, v]) => `- ${m}: ${v.covered}/${v.total}`,
      ),
      "",
      "### Exclusions",
      ...coverage.exclusions.map((e) => `- ${e.method} ${e.path}: ${e.reason}`),
    );
  }
  return maskSecrets(lines.join("\n"));
}

function html(
  results: NormalizedResult,
  analysis: PerformanceAnalysis,
  coverage?: Coverage,
): string {
  const md = markdown(results, analysis, coverage)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>k6-agent performance report</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; background: #0b1220; color: #e8eefc; }
    pre { background: #151d2e; padding: 1.5rem; border-radius: 12px; overflow: auto; line-height: 1.45; }
    h1 { color: #7dd3fc; }
    .badge { display: inline-block; padding: 0.2rem 0.7rem; border-radius: 999px; background: ${
      analysis.overall === "PASS" ? "#14532d" : "#7f1d1d"
    }; }
  </style>
</head>
<body>
  <h1>AI K6 Performance Agent</h1>
  <p><span class="badge">${analysis.overall}</span></p>
  <pre>${md}</pre>
</body>
</html>
`;
}

function junit(results: NormalizedResult, analysis: PerformanceAnalysis): string {
  const cases = results.thresholds.length
    ? results.thresholds
    : [{ name: "run", passed: results.passed }];
  const failures = cases.filter((c) => !c.passed).length;
  const testcases = cases
    .map((c) =>
      c.passed
        ? `    <testcase name="${escapeXml(c.name)}" />`
        : `    <testcase name="${escapeXml(c.name)}"><failure message="${escapeXml(analysis.summary)}"/></testcase>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="k6-agent" tests="${cases.length}" failures="${failures}">
${testcases}
</testsuite>
`;
}

function csv(results: NormalizedResult): string {
  const rows = ["metric,count,rate,min,max,avg,p50,p90,p95,p99"];
  for (const [name, m] of Object.entries(results.metrics)) {
    rows.push(
      [name, m.count, m.rate, m.min, m.max, m.avg, m.p50, m.p90, m.p95, m.p99]
        .map((v) => (v === undefined ? "" : String(v)))
        .join(","),
    );
  }
  return rows.join("\n") + "\n";
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

export function coverageMatrix(
  coverage: Coverage,
): { markdown: string; csv: string; json: string } {
  const rows = coverage.exclusions.map((e) => ({
    endpoint: e.path,
    method: e.method,
    covered: "no",
    reason: e.reason,
  }));
  const markdown = [
    "| Endpoint | Method | Covered | Reason |",
    "| --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.endpoint} | ${r.method} | ${r.covered} | ${r.reason} |`),
  ].join("\n");
  const csv = ["endpoint,method,covered,reason", ...rows.map((r) => `${r.endpoint},${r.method},${r.covered},"${r.reason}"`)].join("\n");
  return { markdown, csv, json: JSON.stringify(rows, null, 2) };
}
