import { Endpoint, HttpMethod, NormalizedApiModel } from "../models/schemas.js";
import { fail } from "../utils/errors.js";

const CALL_RE =
  /http\.(get|post|put|patch|del|delete|head|options)\(\s*[`'"]([^`'"]+)[`'"]/gi;

export function parseK6(contents: string, path: string): NormalizedApiModel {
  const endpoints: Endpoint[] = [];
  const seen = new Set<string>();

  for (const match of contents.matchAll(CALL_RE)) {
    const method = mapMethod(match[1]);
    const rawUrl = match[2];
    const pathName = toPath(rawUrl);
    const id = `${method} ${pathName}`;
    if (seen.has(id)) continue;
    seen.add(id);
    endpoints.push({
      id,
      path: pathName,
      method,
      authentication: /Authorization|API_TOKEN|Bearer/.test(contents) ? "bearer" : "none",
      security: [],
      pathParameters: [...pathName.matchAll(/\$\{?([A-Za-z0-9_]+)\}?/g)].map((m) => ({
        name: m[1],
        in: "path" as const,
        required: true,
      })),
      queryParameters: [],
      headerParameters: [],
      responses: [{ status: "200" }],
      links: [],
      destructive: method === "DELETE",
      paginated: false,
      deprecated: false,
      excluded: false,
      tags: ["imported-k6"],
    });
  }

  if (endpoints.length === 0) {
    fail(
      "K6_NO_CALLS",
      `No k6 http.* calls were found in ${path}.`,
      "The importer looks for http.get/post/put/patch/del. Existing tests are not rewritten unless you pass --refactor.",
    );
  }

  return {
    source: { type: "k6", path, title: "Existing k6 tests" },
    servers: [],
    authentication: [],
    endpoints,
    warnings: [
      "Existing k6 tests were inspected, not rewritten. Use generate --extend to add scenarios.",
    ],
    unsupported: [],
  };
}

function mapMethod(raw: string): HttpMethod {
  const m = raw.toLowerCase();
  if (m === "del" || m === "delete") return "DELETE";
  return m.toUpperCase() as HttpMethod;
}

function toPath(url: string): string {
  const cleaned = url.replace(/\$\{[^}]+\}/g, "{param}").replace(/__ENV\.\w+/g, "");
  try {
    if (cleaned.startsWith("http")) return new URL(cleaned).pathname;
  } catch {
    /* ignore */
  }
  const idx = cleaned.indexOf("/");
  return idx >= 0 ? cleaned.slice(idx).replace(/\$\{|\}/g, "") || "/" : "/";
}
