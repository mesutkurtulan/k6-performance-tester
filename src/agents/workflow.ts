import {
  Coverage,
  Decision,
  Endpoint,
  NormalizedApiModel,
  Workflow,
} from "../models/schemas.js";
import { workflowsFromOpenApiLinks } from "./openapi-links.js";

const RESOURCE_RE = /^\/([^/{]+)(?:\/\{([^}]+)\})?(?:\/([^/{]+))?(?:\/\{([^}]+)\})?/;

export function discoverWorkflows(model: NormalizedApiModel): Workflow[] {
  const groups = new Map<string, Endpoint[]>();
  for (const ep of model.endpoints) {
    const resource = resourceName(ep.path);
    const list = groups.get(resource) ?? [];
    list.push(ep);
    groups.set(resource, list);
  }

  const workflows: Workflow[] = [];
  for (const [resource, endpoints] of groups) {
    const create = endpoints.find((e) => e.method === "POST" && !pathId(e.path));
    const get = endpoints.find((e) => e.method === "GET" && pathId(e.path));
    const list = endpoints.find((e) => e.method === "GET" && !pathId(e.path));
    const update =
      endpoints.find((e) => e.method === "PATCH" && pathId(e.path)) ??
      endpoints.find((e) => e.method === "PUT" && pathId(e.path));
    const del = endpoints.find((e) => e.method === "DELETE" && pathId(e.path));

    const steps = [create, get ?? list, update, del].filter(
      (e): e is Endpoint => Boolean(e),
    );
    if (steps.length < 2) continue;

    const idVar = `${toCamel(resource)}Id`;
    workflows.push({
      name: `${resource}-crud`,
      description: `CRUD workflow for ${resource}`,
      steps: steps.map((s, i) => ({
        id: `step-${i + 1}`,
        endpointId: s.id,
        extracts: s.method === "POST" ? [idVar] : [],
        uses: s.method !== "POST" && pathId(s.path) ? [idVar] : [],
      })),
      variables: [idVar],
      correlation: [`${idVar} from POST response into subsequent path parameters`],
      dataDependencies: create?.requestBody ? [`${resource} request body`] : [],
    });
  }
  return [...workflows, ...workflowsFromOpenApiLinks(model)];
}

export function computeCoverage(
  model: NormalizedApiModel,
  included: Endpoint[],
): Coverage {
  const includedIds = new Set(included.map((e) => e.id));
  const byMethod: Coverage["byMethod"] = {};
  for (const ep of model.endpoints) {
    const bucket = byMethod[ep.method] ?? { total: 0, covered: 0 };
    bucket.total += 1;
    if (includedIds.has(ep.id) && !ep.excluded) bucket.covered += 1;
    byMethod[ep.method] = bucket;
  }
  const exclusions = model.endpoints
    .filter((e) => e.excluded || !includedIds.has(e.id))
    .map((e) => ({
      method: e.method,
      path: e.path,
      reason: e.exclusionReason ?? (e.excluded ? "explicitly excluded" : "not selected for this scenario"),
    }));
  const covered = model.endpoints.filter((e) => includedIds.has(e.id) && !e.excluded).length;
  return {
    total: model.endpoints.length,
    covered,
    uncovered: model.endpoints.length - covered,
    byMethod,
    exclusions,
  };
}

export function applyExclusions(
  model: NormalizedApiModel,
  options: { includeDestructive: boolean; environment?: string },
): { model: NormalizedApiModel; decisions: Decision[] } {
  const decisions: Decision[] = [];
  const endpoints = model.endpoints.map((ep) => {
    if (ep.destructive && !options.includeDestructive) {
      decisions.push({
        decision: `exclude ${ep.id}`,
        reason: "Destructive DELETE omitted until explicitly approved.",
        agent: "workflow-agent",
        confidence: 0.95,
      });
      return {
        ...ep,
        excluded: true,
        exclusionReason: "destructive operation without explicit approval",
      };
    }
    if (ep.deprecated) {
      return {
        ...ep,
        excluded: true,
        exclusionReason: "deprecated operation",
      };
    }
    return ep;
  });
  return { model: { ...model, endpoints }, decisions };
}

function resourceName(path: string): string {
  const match = path.match(RESOURCE_RE);
  return match?.[1] ?? "root";
}

function pathId(path: string): boolean {
  return /\{[^}]+\}/.test(path);
}

function toCamel(value: string): string {
  return value.replace(/[-_](\w)/g, (_, c: string) => c.toUpperCase());
}
