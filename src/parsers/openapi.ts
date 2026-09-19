import { parse as parseYaml } from "yaml";
import {
  AuthScheme,
  AuthType,
  Endpoint,
  HttpMethod,
  NormalizedApiModel,
  Parameter,
} from "../models/schemas.js";
import { fail } from "../utils/errors.js";
import { resolveRefs } from "./refs.js";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function parseOpenApi(contents: string, path: string): NormalizedApiModel {
  let doc: unknown;
  try {
    doc = contents.trim().startsWith("{") ? JSON.parse(contents) : parseYaml(contents);
  } catch (error) {
    fail(
      "OPENAPI_PARSE",
      `Unable to parse OpenAPI document at ${path}: ${String(error)}`,
      "Ensure the file is valid JSON or YAML. Run: k6-agent analyze --verbose",
    );
  }

  if (!isRecord(doc) || (!doc.openapi && !doc.swagger)) {
    fail("OPENAPI_INVALID", `File ${path} is not an OpenAPI or Swagger document.`);
  }

  const resolved = resolveRefs(doc);
  if (!isRecord(resolved)) {
    fail("OPENAPI_INVALID", `OpenAPI document at ${path} resolved to a non-object.`);
  }

  const version = String(resolved.openapi ?? resolved.swagger ?? "");
  const info = isRecord(resolved.info) ? resolved.info : {};
  const warnings: string[] = [];
  const servers = extractServers(resolved, warnings);
  const auth = extractSecurity(resolved);
  const endpoints = extractEndpoints(resolved, auth, warnings);

  if (endpoints.length === 0) {
    fail(
      "OPENAPI_NO_PATHS",
      `No HTTP operations found in ${path}.`,
      "The specification must contain a paths object with operations.",
    );
  }

  return {
    source: {
      type: "openapi",
      path,
      title: typeof info.title === "string" ? info.title : undefined,
      version: typeof info.version === "string" ? info.version : version,
    },
    servers,
    baseUrl: servers[0],
    authentication: auth,
    endpoints,
    warnings,
    unsupported: collectUnresolved(resolved),
  };
}

function extractServers(doc: Record<string, unknown>, warnings: string[]): string[] {
  if (Array.isArray(doc.servers)) {
    return doc.servers
      .map((s) => (isRecord(s) && typeof s.url === "string" ? s.url : undefined))
      .filter((u): u is string => Boolean(u));
  }
  if (typeof doc.host === "string") {
    const schemes = Array.isArray(doc.schemes) ? doc.schemes.map(String) : ["https"];
    const basePath = typeof doc.basePath === "string" ? doc.basePath : "";
    return [`${schemes[0]}://${doc.host}${basePath}`];
  }
  warnings.push("No servers/host found; generated tests will use __ENV.BASE_URL.");
  return [];
}

function extractSecurity(doc: Record<string, unknown>): AuthScheme[] {
  const schemes: AuthScheme[] = [];
  const components = isRecord(doc.components) ? doc.components : {};
  const securitySchemes = isRecord(components.securitySchemes)
    ? components.securitySchemes
    : isRecord(doc.securityDefinitions)
      ? doc.securityDefinitions
      : {};

  for (const [name, raw] of Object.entries(securitySchemes)) {
    if (!isRecord(raw)) continue;
    schemes.push(mapSecurityScheme(name, raw));
  }
  return schemes;
}

function mapSecurityScheme(name: string, raw: Record<string, unknown>): AuthScheme {
  const type = String(raw.type ?? "apiKey");
  if (type === "http" && String(raw.scheme).toLowerCase() === "bearer") {
    return { name, type: "bearer", envVars: ["API_TOKEN"], location: "header", headerName: "Authorization" };
  }
  if (type === "http" && String(raw.scheme).toLowerCase() === "basic") {
    return { name, type: "basic", envVars: ["BASIC_USER", "BASIC_PASSWORD"], location: "header" };
  }
  if (type === "oauth2") {
    return { name, type: "oauth2", envVars: ["CLIENT_ID", "CLIENT_SECRET", "API_TOKEN"] };
  }
  if (type === "apiKey") {
    const location = (raw.in as AuthScheme["location"]) ?? "header";
    const headerName = typeof raw.name === "string" ? raw.name : "X-API-Key";
    return { name, type: "apiKey", envVars: ["API_KEY"], location, headerName };
  }
  if (String(raw.scheme).toLowerCase() === "jwt") {
    return { name, type: "jwt", envVars: ["API_TOKEN"], headerName: "Authorization" };
  }
  return { name, type: "customHeader", envVars: ["API_TOKEN"] };
}

function extractEndpoints(
  doc: Record<string, unknown>,
  auth: AuthScheme[],
  warnings: string[],
): Endpoint[] {
  const paths = isRecord(doc.paths) ? doc.paths : {};
  const globalSecurity = Array.isArray(doc.security) ? doc.security : [];
  const endpoints: Endpoint[] = [];

  for (const [path, ops] of Object.entries(paths)) {
    if (!isRecord(ops)) continue;
    const pathParams = Array.isArray(ops.parameters) ? ops.parameters : [];
    for (const method of METHODS) {
      const key = method.toLowerCase();
      const op = ops[key];
      if (!isRecord(op)) continue;
      const combinedParams = [
        ...pathParams,
        ...(Array.isArray(op.parameters) ? op.parameters : []),
      ];
      const parameters = combinedParams.filter(isRecord).map(toParameter);
      const opSecurity = Array.isArray(op.security) ? op.security : globalSecurity;
      const securityNames = opSecurity.flatMap((s) => (isRecord(s) ? Object.keys(s) : []));
      const authType = resolveAuth(securityNames, auth);
      const body = extractBody(op);
      const paginated = parameters.some(
        (p) => /page|limit|offset|cursor|size/i.test(p.name) && p.in === "query",
      );

      endpoints.push({
        id: `${method} ${path}`,
        path,
        method,
        operationId: typeof op.operationId === "string" ? op.operationId : undefined,
        summary: typeof op.summary === "string" ? op.summary : undefined,
        tags: Array.isArray(op.tags) ? op.tags.map(String) : [],
        authentication: authType,
        security: securityNames,
        pathParameters: parameters.filter((p) => p.in === "path"),
        queryParameters: parameters.filter((p) => p.in === "query"),
        headerParameters: parameters.filter((p) => p.in === "header"),
        requestBody: body,
        responses: extractResponses(op),
        links: extractLinks(op),
        destructive: method === "DELETE",
        paginated,
        deprecated: op.deprecated === true,
        excluded: false,
      });
    }
  }

  if (endpoints.length === 0) warnings.push("No operations discovered under paths.");
  return endpoints;
}

function toParameter(raw: Record<string, unknown>): Parameter {
  return {
    name: String(raw.name ?? "unknown"),
    in: (raw.in as Parameter["in"]) ?? "query",
    required: raw.required === true || raw.in === "path",
    schema: raw.schema,
    example: raw.example ?? raw.default,
    description: typeof raw.description === "string" ? raw.description : undefined,
  };
}

function extractBody(op: Record<string, unknown>): Endpoint["requestBody"] {
  if (isRecord(op.requestBody)) {
    const content = isRecord(op.requestBody.content) ? op.requestBody.content : {};
    const json = isRecord(content["application/json"]) ? content["application/json"] : undefined;
    const first = json ?? (Object.values(content)[0] as Record<string, unknown> | undefined);
    return {
      required: op.requestBody.required === true,
      contentType: json ? "application/json" : Object.keys(content)[0],
      schema: first?.schema,
      example: first?.example ?? first?.examples,
    };
  }
  const params = Array.isArray(op.parameters) ? op.parameters : [];
  const body = params.find((p) => isRecord(p) && p.in === "body");
  if (isRecord(body)) {
    return {
      required: body.required === true,
      contentType: "application/json",
      schema: body.schema,
      example: body.example,
    };
  }
  return undefined;
}

function extractLinks(op: Record<string, unknown>): Endpoint["links"] {
  const responses = isRecord(op.responses) ? op.responses : {};
  const links: Endpoint["links"] = [];
  for (const raw of Object.values(responses)) {
    if (!isRecord(raw) || !isRecord(raw.links)) continue;
    for (const [name, link] of Object.entries(raw.links)) {
      if (!isRecord(link)) continue;
      const parameters: Record<string, string> = {};
      if (isRecord(link.parameters)) {
        for (const [k, v] of Object.entries(link.parameters)) {
          if (typeof v === "string") parameters[k] = v;
        }
      }
      links.push({
        name,
        operationId: typeof link.operationId === "string" ? link.operationId : undefined,
        operationRef: typeof link.operationRef === "string" ? link.operationRef : undefined,
        parameters,
      });
    }
  }
  return links;
}

function extractResponses(op: Record<string, unknown>): Endpoint["responses"] {
  const responses = isRecord(op.responses) ? op.responses : {};
  return Object.entries(responses).map(([status, raw]) => ({
    status,
    description: isRecord(raw) && typeof raw.description === "string" ? raw.description : undefined,
    schema: isRecord(raw) ? raw.content ?? raw.schema : undefined,
  }));
}

function resolveAuth(names: string[], schemes: AuthScheme[]): AuthType {
  if (names.length === 0 && schemes.length === 0) return "none";
  if (names.length === 0 && schemes.length > 0) return schemes[0].type;
  const match = schemes.find((s) => names.includes(s.name));
  return match?.type ?? (names.length ? "bearer" : "none");
}

function collectUnresolved(doc: unknown): string[] {
  const found: string[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isRecord(node)) return;
    if (typeof node.unresolvedRef === "string") found.push(node.unresolvedRef);
    Object.values(node).forEach(visit);
  };
  visit(doc);
  return [...new Set(found)];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
