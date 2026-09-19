import { NormalizedResult } from "../models/schemas.js";

export interface RegressionFinding {
  metric: string;
  kind: "latency" | "throughput" | "error-rate" | "threshold";
  previous: number;
  current: number;
  changePct: number;
  regressed: boolean;
}

export function compareResults(
  current: NormalizedResult,
  baseline: NormalizedResult,
  tolerancePct = 10,
): { findings: RegressionFinding[]; regressed: boolean } {
  const findings: RegressionFinding[] = [];

  const compare = (
    metric: string,
    kind: RegressionFinding["kind"],
    curr?: number,
    prev?: number,
    higherIsWorse = true,
  ) => {
    if (curr === undefined || prev === undefined || prev === 0) return;
    const changePct = ((curr - prev) / prev) * 100;
    const worse = higherIsWorse ? changePct > tolerancePct : changePct < -tolerancePct;
    findings.push({
      metric,
      kind,
      previous: prev,
      current: curr,
      changePct,
      regressed: worse,
    });
  };

  compare(
    "http_req_duration.p95",
    "latency",
    current.metrics.http_req_duration?.p95,
    baseline.metrics.http_req_duration?.p95,
    true,
  );
  compare(
    "http_reqs.rate",
    "throughput",
    current.metrics.http_reqs?.rate,
    baseline.metrics.http_reqs?.rate,
    false,
  );
  compare(
    "http_req_failed.rate",
    "error-rate",
    current.metrics.http_req_failed?.rate ?? current.metrics.http_req_failed?.value,
    baseline.metrics.http_req_failed?.rate ?? baseline.metrics.http_req_failed?.value,
    true,
  );

  const baseFail = baseline.thresholds.filter((t) => !t.passed).length;
  const currFail = current.thresholds.filter((t) => !t.passed).length;
  if (currFail > baseFail) {
    findings.push({
      metric: "threshold.failures",
      kind: "threshold",
      previous: baseFail,
      current: currFail,
      changePct: baseFail === 0 ? 100 : ((currFail - baseFail) / baseFail) * 100,
      regressed: true,
    });
  }

  return { findings, regressed: findings.some((f) => f.regressed) };
}
