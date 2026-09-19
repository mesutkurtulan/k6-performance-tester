import { Endpoint, HttpMethod, NormalizedApiModel } from "../models/schemas.js";
import { fail } from "../utils/errors.js";

export function parseHar(contents: string, path: string): NormalizedApiModel {
  let doc: unknown;
  try {
    doc = JSON.parse(contents);
  } catch (error) {
    fail("HAR_PARSE", `Unable to parse HAR at ${path}: ${String(error)}`);
  }
  if (!isRecord(doc) || !isRecord(doc.log) || !Array.isArray(doc.log.entries)) {
    fail(
      "HAR_INVALID",
      `File ${path} is not a HAR 1.2 log (expected log.entries[]).`,
      "Export HAR from browser DevTools or a proxy, then: k6-agent analyze capture.har",
    );
  }

  const endpoints: Endpoint[] = [];
  const seen = new Set<string>();
  const servers = new Set<string>();
  const warnings: string[] = [];

  for (const entry of doc.log.entries) {
    if (!isRecord(entry) || !isRecord(entry.request)) continue;
    const req = entry.request;
    const method = String(req.method ?? "GET").toUpperCase() as HttpMethod;
    const rawUrl = String(req.url ?? "");
    if (!rawUrl) continue;
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      warnings.push(`Skipped HAR entry with invalid URL`);
      continue;
    }
    servers.add(`${parsed.protocol}//${parsed.host}`);
    const pathname = parsed.pathname || "/";
    const id = `${method} ${pathname}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const headers = Array.isArray(req.headers) ? req.headers.filter(isRecord) : [];
    const authHeader = headers.find((h) => String(h.name).toLowerCase() === "authorization");
    const apiKey = headers.find((h) => /api-?key/i.test(String(h.name)));
    let authentication: Endpoint["authentication"] = "none";
    if (authHeader && /bearer/i.test(String(authHeader.value ?? ""))) authentication = "bearer";
    else if (authHeader && /basic/i.test(String(authHeader.value ?? ""))) authentication = "basic";
    else if (apiKey) authentication = "apiKey";

    const post = isRecord(req.postData) ? req.postData : undefined;
    let requestBody: Endpoint["requestBody"];
    if (post && typeof post.text === "string" && post.text.length > 0) {
      let example: unknown = post.text;
      try {
        example = JSON.parse(post.text);
      } catch {
        /* keep raw */
      }
      requestBody = {
        required: true,
        contentType: typeof post.mimeType === "string" ? post.mimeType : "application/json",
        example,
      };
    }

    const query = Array.isArray(req.queryString)
      ? req.queryString.filter(isRecord).map((q) => ({
          name: String(q.name ?? ""),
          in: "query" as const,
          required: false,
          example: q.value !== undefined ? String(q.value) : undefined,
        }))
      : [...parsed.searchParams.entries()].map(([name, example]) => ({
          name,
          in: "query" as const,
          required: false,
          example,
        }));

    const status = isRecord(entry.response) ? String(entry.response.status ?? "200") : "200";

    endpoints.push({
      id,
      path: pathname,
      method,
      authentication,
      security: authentication === "none" ? [] : [authentication],
      pathParameters: [...pathname.matchAll(/\{([^}]+)\}/g)].map((m) => ({
        name: m[1],
        in: "path" as const,
        required: true,
      })),
      queryParameters: query,
      headerParameters: headers
        .filter((h) => {
          const n = String(h.name).toLowerCase();
          return n !== "authorization" && n !== "cookie" && n !== "content-type";
        })
        .map((h) => ({
          name: String(h.name),
          in: "header" as const,
          required: false,
        })),
      requestBody,
      responses: [{ status }],
      links: [],
      destructive: method === "DELETE",
      paginated: query.some((q) => /page|limit|offset|cursor/i.test(q.name)),
      deprecated: false,
      excluded: false,
      tags: ["har"],
    });
  }

  if (endpoints.length === 0) {
    fail("HAR_EMPTY", `No HTTP requests found in HAR ${path}.`);
  }

  const types = new Set(endpoints.map((e) => e.authentication).filter((t) => t !== "none"));
  return {
    source: { type: "har", path, title: "HAR capture" },
    servers: [...servers],
    baseUrl: [...servers][0],
    authentication: [...types].map((type) => ({
      name: type,
      type,
      envVars: type === "basic" ? ["BASIC_USER", "BASIC_PASSWORD"] : type === "apiKey" ? ["API_KEY"] : ["API_TOKEN"],
    })),
    endpoints,
    warnings,
    unsupported: [],
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
