import { Endpoint, HttpMethod, NormalizedApiModel } from "../models/schemas.js";
import { fail } from "../utils/errors.js";
import { maskSecrets } from "../utils/secrets.js";

export function parseCurl(contents: string, path: string): NormalizedApiModel {
  const commands = splitCurlCommands(contents);
  if (commands.length === 0) {
    fail("CURL_EMPTY", `No curl commands found in ${path}.`);
  }

  const endpoints: Endpoint[] = [];
  const warnings: string[] = [];
  const servers = new Set<string>();

  for (const command of commands) {
    try {
      const parsed = parseOne(command);
      if (parsed.server) servers.add(parsed.server);
      endpoints.push(parsed.endpoint);
    } catch (error) {
      warnings.push(`Skipped malformed curl: ${maskSecrets(String(error))}`);
    }
  }

  if (endpoints.length === 0) {
    fail(
      "CURL_INVALID",
      `Unable to parse curl commands in ${path}.`,
      "Supported flags: -X, -H, -d/--data, -u, --url. Run: k6-agent analyze --verbose",
    );
  }

  return {
    source: { type: "curl", path, title: "cURL import" },
    servers: [...servers],
    baseUrl: [...servers][0],
    authentication: detectAuth(endpoints),
    endpoints,
    warnings,
    unsupported: [],
  };
}

function splitCurlCommands(text: string): string[] {
  const cleaned = text
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  return cleaned
    .split(/\\\s*\n/)
    .join(" ")
    .split(/\n(?=\s*curl\s+)/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith("curl"));
}

function parseOne(command: string): { endpoint: Endpoint; server?: string } {
  const tokens = tokenize(command);
  let method: HttpMethod = "GET";
  let url = "";
  const headers: { name: string; value: string }[] = [];
  let body: string | undefined;
  let basic: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "curl") continue;
    if (t === "-X" || t === "--request") {
      method = String(tokens[++i] ?? "GET").toUpperCase() as HttpMethod;
      continue;
    }
    if (t === "-H" || t === "--header") {
      const raw = tokens[++i] ?? "";
      const idx = raw.indexOf(":");
      if (idx > 0) headers.push({ name: raw.slice(0, idx).trim(), value: raw.slice(idx + 1).trim() });
      continue;
    }
    if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") {
      body = tokens[++i];
      if (method === "GET") method = "POST";
      continue;
    }
    if (t === "-u" || t === "--user") {
      basic = tokens[++i];
      continue;
    }
    if (t === "--url") {
      url = tokens[++i] ?? "";
      continue;
    }
    if (t === "-I" || t === "--head") {
      method = "HEAD";
      continue;
    }
    if (!t.startsWith("-") && /^https?:\/\//i.test(t)) {
      url = t;
    }
  }

  if (!url) {
    throw new Error("curl command missing URL");
  }

  const parsedUrl = new URL(url);
  const path = parsedUrl.pathname || "/";
  const queryParameters = [...parsedUrl.searchParams.entries()].map(([name, example]) => ({
    name,
    in: "query" as const,
    required: false,
    example,
  }));

  let authentication: Endpoint["authentication"] = "none";
  if (headers.some((h) => /^authorization$/i.test(h.name) && /bearer/i.test(h.value))) {
    authentication = "bearer";
  } else if (headers.some((h) => /api-?key/i.test(h.name))) {
    authentication = "apiKey";
  } else if (basic) {
    authentication = "basic";
  }

  let requestBody: Endpoint["requestBody"];
  if (body) {
    let example: unknown = body;
    try {
      example = JSON.parse(body);
    } catch {
      /* raw */
    }
    requestBody = { required: true, contentType: "application/json", example };
  }

  return {
    server: `${parsedUrl.protocol}//${parsedUrl.host}`,
    endpoint: {
      id: `${method} ${path}`,
      path,
      method,
      authentication,
      security: authentication === "none" ? [] : [authentication],
      pathParameters: [...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
        name: m[1],
        in: "path" as const,
        required: true,
      })),
      queryParameters,
      headerParameters: headers
        .filter((h) => !/^authorization$/i.test(h.name) && !/api-?key/i.test(h.name))
        .map((h) => ({ name: h.name, in: "header" as const, required: false, example: undefined })),
      requestBody,
      responses: [{ status: "200" }],
      links: [],
      destructive: method === "DELETE",
      paginated: queryParameters.some((q) => /page|limit|offset/i.test(q.name)),
      deprecated: false,
      excluded: false,
      tags: [],
    },
  };
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function detectAuth(endpoints: Endpoint[]) {
  const types = new Set(endpoints.map((e) => e.authentication).filter((t) => t !== "none"));
  return [...types].map((type) => ({
    name: type,
    type,
    envVars:
      type === "oauth2"
        ? ["CLIENT_ID", "CLIENT_SECRET", "API_TOKEN"]
        : type === "basic"
          ? ["BASIC_USER", "BASIC_PASSWORD"]
          : type === "apiKey"
            ? ["API_KEY"]
            : ["API_TOKEN"],
  }));
}
