import { AuthScheme, Endpoint, HttpMethod, NormalizedApiModel } from "../models/schemas.js";
import { fail } from "../utils/errors.js";

export function parsePostman(contents: string, path: string): NormalizedApiModel {
  let doc: unknown;
  try {
    doc = JSON.parse(contents);
  } catch (error) {
    fail("POSTMAN_PARSE", `Unable to parse Postman collection at ${path}: ${String(error)}`);
  }
  if (!isRecord(doc) || !isRecord(doc.info) || !Array.isArray(doc.item)) {
    fail(
      "POSTMAN_INVALID",
      `File ${path} is not a Postman Collection (expected info + item[]).`,
      "Export Collection v2.1 JSON from Postman.",
    );
  }

  const warnings: string[] = [];
  const unsupported: string[] = [];
  const endpoints: Endpoint[] = [];
  const variables = collectVariables(doc);
  const auth = mapAuth(doc.auth);
  walkItems(doc.item, endpoints, auth, warnings, unsupported, "");

  const baseUrl = variables.baseUrl ?? variables.BASE_URL ?? variables.baseURL;

  return {
    source: {
      type: "postman",
      path,
      title: typeof doc.info.name === "string" ? doc.info.name : undefined,
      version: typeof doc.info.schema === "string" ? "v2.1" : undefined,
    },
    servers: baseUrl ? [String(baseUrl)] : [],
    baseUrl,
    authentication: auth ? [auth] : [],
    endpoints,
    warnings,
    unsupported,
  };
}

function walkItems(
  items: unknown[],
  endpoints: Endpoint[],
  auth: AuthScheme | undefined,
  warnings: string[],
  unsupported: string[],
  folder: string,
): void {
  for (const item of items) {
    if (!isRecord(item)) continue;
    if (Array.isArray(item.item)) {
      walkItems(item.item, endpoints, auth, warnings, unsupported, joinName(folder, item.name));
      continue;
    }
    const request = item.request;
    if (!request) continue;
    if (typeof request === "string") {
      endpoints.push(simpleGet(request, String(item.name ?? request), folder, auth));
      continue;
    }
    if (!isRecord(request)) continue;

    const method = String(request.method ?? "GET").toUpperCase() as HttpMethod;
    const url = parseUrl(request.url);
    const headers = parseHeaders(request.header);
    const body = parseBody(request.body);
    const itemAuth = mapAuth(request.auth) ?? auth;

    const events = Array.isArray(item.event) ? item.event : [];
    for (const ev of events) {
      if (isRecord(ev) && ev.listen) {
        unsupported.push(
          `Postman script on "${item.name ?? url.path}" (${String(ev.listen)}) was not converted.`,
        );
      }
    }

    const pathParams = [...url.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => ({
      name: m[1],
      in: "path" as const,
      required: true,
    }));
    const queryParams = url.query.map((q) => ({
      name: q.key,
      in: "query" as const,
      required: false,
      example: q.value,
    }));

    endpoints.push({
      id: `${method} ${url.path}`,
      path: url.path,
      method,
      summary: typeof item.name === "string" ? item.name : undefined,
      tags: folder ? [folder] : [],
      authentication: itemAuth?.type ?? "none",
      security: itemAuth ? [itemAuth.name] : [],
      pathParameters: pathParams,
      queryParameters: queryParams,
      headerParameters: headers
        .filter((h) => !/^authorization$/i.test(h.key))
        .map((h) => ({
          name: h.key,
          in: "header" as const,
          required: false,
          example: h.value,
        })),
      requestBody: body,
      responses: [{ status: "200" }],
      links: [],
      destructive: method === "DELETE",
      paginated: queryParams.some((q) => /page|limit|offset|cursor/i.test(q.name)),
      deprecated: false,
      excluded: false,
    });
  }
}

function simpleGet(url: string, name: string, folder: string, auth?: AuthScheme): Endpoint {
  const path = toPath(url);
  return {
    id: `GET ${path}`,
    path,
    method: "GET",
    summary: name,
    tags: folder ? [folder] : [],
    authentication: auth?.type ?? "none",
    security: [],
    pathParameters: [],
    queryParameters: [],
    headerParameters: [],
    responses: [{ status: "200" }],
    links: [],
    destructive: false,
    paginated: false,
    deprecated: false,
    excluded: false,
  };
}

function parseUrl(url: unknown): { path: string; query: { key: string; value?: string }[] } {
  if (typeof url === "string") {
    return { path: toPath(url), query: [] };
  }
  if (!isRecord(url)) return { path: "/", query: [] };
  const pathParts = Array.isArray(url.path) ? url.path.map(String) : [];
  const raw = pathParts.length
    ? "/" + pathParts.join("/").replace(/\{\{([^}]+)\}\}/g, ":$1")
    : toPath(String(url.raw ?? "/"));
  const query = Array.isArray(url.query)
    ? url.query
        .filter(isRecord)
        .map((q) => ({ key: String(q.key ?? ""), value: q.value !== undefined ? String(q.value) : undefined }))
    : [];
  return { path: raw.replace(/\/+/g, "/"), query };
}

function toPath(url: string): string {
  const mapped = url.replace(/\{\{([^}]+)\}\}/g, ":$1");
  try {
    const u = new URL(mapped.replace(/^:\w+/, "https://placeholder"));
    return u.pathname || "/";
  } catch {
    const idx = mapped.indexOf("/", mapped.includes("://") ? mapped.indexOf("://") + 3 : 0);
    return idx >= 0 ? mapped.slice(idx) : mapped.startsWith("/") ? mapped : `/${mapped}`;
  }
}

function parseHeaders(header: unknown): { key: string; value: string }[] {
  if (!Array.isArray(header)) return [];
  return header
    .filter(isRecord)
    .map((h) => ({ key: String(h.key ?? ""), value: String(h.value ?? "") }));
}

function parseBody(body: unknown): Endpoint["requestBody"] {
  if (!isRecord(body) || !body.mode) return undefined;
  if (body.mode === "raw" && typeof body.raw === "string") {
    let example: unknown = body.raw;
    try {
      example = JSON.parse(body.raw);
    } catch {
      /* keep raw */
    }
    return { required: true, contentType: "application/json", example };
  }
  return { required: false, contentType: String(body.mode) };
}

function mapAuth(auth: unknown): AuthScheme | undefined {
  if (!isRecord(auth) || typeof auth.type !== "string") return undefined;
  const type = auth.type.toLowerCase();
  if (type === "bearer") {
    return { name: "bearer", type: "bearer", envVars: ["API_TOKEN"], headerName: "Authorization" };
  }
  if (type === "basic") {
    return { name: "basic", type: "basic", envVars: ["BASIC_USER", "BASIC_PASSWORD"] };
  }
  if (type === "apikey") {
    return { name: "apiKey", type: "apiKey", envVars: ["API_KEY"], headerName: "X-API-Key" };
  }
  if (type === "oauth2") {
    return { name: "oauth2", type: "oauth2", envVars: ["CLIENT_ID", "CLIENT_SECRET", "API_TOKEN"] };
  }
  return { name: type, type: "customHeader", envVars: ["API_TOKEN"] };
}

function collectVariables(doc: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const vars = Array.isArray(doc.variable) ? doc.variable : [];
  for (const v of vars) {
    if (isRecord(v) && typeof v.key === "string") out[v.key] = String(v.value ?? "");
  }
  return out;
}

function joinName(folder: string, name: unknown): string {
  const n = typeof name === "string" ? name : "folder";
  return folder ? `${folder}/${n}` : n;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
