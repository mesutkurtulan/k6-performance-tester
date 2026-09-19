import { Endpoint, NormalizedApiModel } from "../models/schemas.js";

export function generateFixtures(model: NormalizedApiModel): Record<string, unknown> {
  const byTag: Record<string, unknown[]> = {};
  for (const ep of model.endpoints) {
    if (!ep.requestBody?.example && !ep.requestBody?.schema) continue;
    const key = (ep.tags[0] ?? resourceFromPath(ep.path)).toLowerCase();
    const payload = exampleFromEndpoint(ep);
    const list = (byTag[key] as unknown[] | undefined) ?? [];
    list.push(payload);
    byTag[key] = list;
  }
  return {
    generatedAt: "static",
    note: "Fixtures contain no secrets. Override per environment in data/environments.",
    resources: byTag,
    environments: {
      dev: { baseUrl: model.baseUrl ?? "http://127.0.0.1:4010" },
      test: { baseUrl: model.baseUrl ?? "http://127.0.0.1:4010" },
      prod: { baseUrl: "SET_ME" },
    },
  };
}

export function exampleFromEndpoint(endpoint: Endpoint): Record<string, unknown> {
  if (endpoint.requestBody?.example && isRecord(endpoint.requestBody.example)) {
    return stripSecrets(endpoint.requestBody.example);
  }
  const schema = endpoint.requestBody?.schema;
  return stripSecrets(exampleFromSchema(schema));
}

export function exampleFromSchema(schema: unknown): Record<string, unknown> {
  if (!isRecord(schema)) return { name: "perf-item", id: "${__ENV.ITEM_ID}" };
  if (schema.example && isRecord(schema.example)) return schema.example;
  if (schema.properties && isRecord(schema.properties)) {
    const out: Record<string, unknown> = {};
    const required = Array.isArray(schema.required) ? schema.required.map(String) : Object.keys(schema.properties);
    for (const key of required) {
      const prop = schema.properties[key];
      out[key] = exampleProp(key, prop);
    }
    return out;
  }
  return { name: "perf-item" };
}

function exampleProp(key: string, prop: unknown): unknown {
  if (!isRecord(prop)) return `${key}-value`;
  if (prop.example !== undefined) return prop.example;
  if (prop.enum && Array.isArray(prop.enum)) return prop.enum[0];
  switch (prop.type) {
    case "integer":
    case "number":
      return 1;
    case "boolean":
      return true;
    case "array":
      return [];
    case "object":
      return exampleFromSchema(prop);
    default:
      if (/email/i.test(key)) return "user@example.com";
      if (/id$/i.test(key)) return "1";
      return `${key}-sample`;
  }
}

function stripSecrets(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (/password|secret|token|api[_-]?key/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

function resourceFromPath(path: string): string {
  return path.split("/").filter(Boolean)[0] ?? "items";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
