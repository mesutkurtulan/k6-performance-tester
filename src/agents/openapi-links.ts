import { Endpoint, NormalizedApiModel, Workflow } from "../models/schemas.js";

export function workflowsFromOpenApiLinks(model: NormalizedApiModel): Workflow[] {
  const byOp = new Map<string, Endpoint>();
  for (const ep of model.endpoints) {
    if (ep.operationId) byOp.set(ep.operationId, ep);
  }

  const workflows: Workflow[] = [];
  for (const source of model.endpoints) {
    if (!source.links?.length) continue;
    for (const link of source.links) {
      const target = link.operationId ? byOp.get(link.operationId) : undefined;
      if (!target) continue;
      const extracts = Object.values(link.parameters)
        .map(pointerToVar)
        .filter(Boolean) as string[];
      const uses = Object.keys(link.parameters);
      workflows.push({
        name: `link-${link.name}`,
        description: `OpenAPI link ${link.name}: ${source.id} → ${target.id}`,
        steps: [
          {
            id: `step-1`,
            endpointId: source.id,
            extracts,
            uses: [],
          },
          {
            id: `step-2`,
            endpointId: target.id,
            extracts: [],
            uses,
          },
        ],
        variables: [...new Set([...extracts, ...uses])],
        correlation: Object.entries(link.parameters).map(
          ([param, expr]) => `${param} <= ${expr} (${source.id} → ${target.id})`,
        ),
        dataDependencies: source.requestBody ? [`${source.id} body`] : [],
      });
    }
  }
  return workflows;
}

export function pointerToVar(expr: string): string | undefined {
  const body = expr.match(/\$response\.body#\/(.+)$/);
  if (body) return body[1].split("/").filter(Boolean).pop();
  const header = expr.match(/\$response\.header\.([^/]+)$/i);
  if (header) return header[1];
  return undefined;
}
