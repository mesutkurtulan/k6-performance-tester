export type PersonaId =
  | "qa"
  | "performance-engineer"
  | "developer"
  | "devops"
  | "qa-lead"
  | "architect"
  | "pm";

export const PERSONA_ALIASES: Record<string, PersonaId> = {
  qa: "qa",
  "qa-engineer": "qa",
  performance: "performance-engineer",
  "performance-engineer": "performance-engineer",
  developer: "developer",
  devops: "devops",
  "devops-engineer": "devops",
  "qa-lead": "qa-lead",
  architect: "architect",
  pm: "pm",
  "product-manager": "pm",
};

export function resolvePersona(value?: string): PersonaId {
  if (!value) return "performance-engineer";
  return PERSONA_ALIASES[value] ?? "performance-engineer";
}

export function renderPersonaView(
  persona: PersonaId,
  analysis: { overall: string; summary: string; primaryIssue?: string; recommendations: string[] },
  results: { passed: boolean; metrics: Record<string, { p95?: number; rate?: number }> },
): string {
  const p95 = results.metrics.http_req_duration?.p95;
  const err = results.metrics.http_req_failed?.rate;
  switch (persona) {
    case "qa":
      return `QA view: checks/thresholds ${results.passed ? "held" : "failed"}. Validate negative cases and required fields next.`;
    case "developer":
      return `Developer view: ${analysis.primaryIssue ?? "no failing threshold"}. Inspect handler latency and error patterns for tagged endpoints.`;
    case "devops":
      return `DevOps view: p95=${p95 ?? "n/a"}ms errorRate=${err ?? "n/a"}. Correlate with CPU, memory, and autoscaling if this environment is instrumented.`;
    case "pm":
      return `Product view: release risk is ${results.passed ? "low for the tested profile" : "elevated — SLA-style gates failed"}. User impact is inferred, not measured from RUM.`;
    case "architect":
      return `Architect view: ${analysis.summary} Capacity claims require more than a single k6 run.`;
    case "qa-lead":
      return `QA lead view: coverage of this run is limited to generated scenarios. Track residual risk on excluded destructive endpoints.`;
    default:
      return `Performance view: ${analysis.summary}`;
  }
}
