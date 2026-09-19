import {
  AuthScheme,
  Endpoint,
  GeneratedFile,
  NormalizedApiModel,
  PerformanceStrategy,
  Scenario,
  Workflow,
} from "../models/schemas.js";
import { exampleFromEndpoint } from "./test-data.js";

export interface GenerateOptions {
  outDir: string;
  includeDestructive: boolean;
  includeNegative: boolean;
  lang?: "js" | "ts";
}

export function generateK6(
  model: NormalizedApiModel,
  strategy: PerformanceStrategy,
  workflows: Workflow[],
  options: GenerateOptions,
): GeneratedFile[] {
  const endpoints = model.endpoints.filter((e) => !e.excluded);
  const selected = endpoints.filter((e) => options.includeDestructive || !e.destructive);
  const type = strategy.testType === "custom" ? "load" : strategy.testType;
  const dir = options.outDir;
  const lang = options.lang ?? "js";
  const ext = lang === "ts" ? "ts" : "js";
  const optionsJs = renderOptionsJs(strategy);

  const files: GeneratedFile[] = [
    { path: `${dir}/shared/config.${ext}`, contents: configModule(lang) },
    { path: `${dir}/shared/auth.${ext}`, contents: authModule(model.authentication, lang) },
    { path: `${dir}/shared/http.${ext}`, contents: httpModule(lang) },
    {
      path: `${dir}/data/fixtures.json`,
      contents: JSON.stringify(
        Object.fromEntries(
          selected.filter((e) => e.requestBody).map((e) => [e.id, exampleFromEndpoint(e)]),
        ),
        null,
        2,
      ),
    },
    {
      path: `${dir}/${type}/main.${ext}`,
      contents: mainTest(model, selected, optionsJs, ext),
    },
  ];

  if (workflows.length > 0) {
    files.push({
      path: `${dir}/workflows/main.${ext}`,
      contents: workflowTest(selected, workflows, optionsJs, ext),
    });
  }
  if (options.includeNegative) {
    files.push({
      path: `${dir}/${type}/negative.${ext}`,
      contents: negativeTest(selected, optionsJs, ext),
    });
  }
  if (lang === "ts") {
    files.push({
      path: `${dir}/k6-env.d.ts`,
      contents: k6EnvDts(),
    });
    files.push({
      path: `${dir}/tsconfig.json`,
      contents: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ES2022",
            moduleResolution: "bundler",
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            allowImportingTsExtensions: true,
            noUncheckedIndexedAccess: false,
          },
          include: ["**/*.ts"],
        },
        null,
        2,
      ),
    });
  }
  return files;
}

function k6EnvDts(): string {
  return `/** Local k6 typings so generated tests type-check without @types/k6. */
declare const __ENV: Record<string, string | undefined>;
declare function open(path: string): string;

declare module "k6" {
  export function check(
    res: { status: number },
    checks: Record<string, (r: { status: number }) => boolean>,
  ): boolean;
  export function fail(message: string): never;
  export function group(name: string, fn: () => void): void;
  export function sleep(seconds: number): void;
}

declare module "k6/http" {
  export interface Response {
    status: number;
    json: ((selector?: string) => unknown) & (() => unknown);
  }
  const http: {
    request(
      method: string,
      url: string,
      body?: string | null,
      params?: Record<string, unknown>,
    ): Response;
    get(url: string, params?: Record<string, unknown>): Response;
    post(url: string, body?: string, params?: Record<string, unknown>): Response;
    expectedStatuses(...codes: unknown[]): unknown;
    setResponseCallback(callback: unknown): void;
  };
  export default http;
}

declare module "k6/encoding" {
  const encoding: { b64encode(input: string): string };
  export default encoding;
}
`;
}

function configModule(_lang: "js" | "ts"): string {
  return `const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:4010';
const RATE = Number(__ENV.RATE || 10);
const DURATION = __ENV.DURATION || '5m';
const VUS = Number(__ENV.VUS || 5);

export { BASE_URL, RATE, DURATION, VUS };
`;
}

function authModule(schemes: AuthScheme[], lang: "js" | "ts"): string {
  const primary = schemes[0];
  const type = primary?.type ?? "none";
  const ret = lang === "ts" ? ": Record<string, string>" : "";
  return `import encoding from 'k6/encoding';

/**
 * Authentication helpers. Credentials come from environment variables only.
 */
export function authHeaders()${ret} {
  const headers${ret} = { 'Content-Type': 'application/json' };
  const type = ${JSON.stringify(type)};
  if (type === 'bearer' || type === 'jwt' || type === 'oauth2') {
    if (__ENV.API_TOKEN) headers['Authorization'] = 'Bearer ' + __ENV.API_TOKEN;
  } else if (type === 'apiKey') {
    const name = ${JSON.stringify(primary?.headerName ?? "X-API-Key")};
    if (__ENV.API_KEY) headers[name] = __ENV.API_KEY;
  } else if (type === 'basic') {
    const user = __ENV.BASIC_USER || '';
    const pass = __ENV.BASIC_PASSWORD || '';
    if (user) headers['Authorization'] = 'Basic ' + encoding.b64encode(user + ':' + pass);
  }
  return headers;
}
`;
}

function httpModule(lang: "js" | "ts"): string {
  const ext = lang === "ts" ? "ts" : "js";
  const typed =
    lang === "ts"
      ? `export function request(method: string, path: string, body?: unknown, tags?: Record<string, string>) {`
      : `export function request(method, path, body, tags) {`;
  return `import http from 'k6/http';
import { check, fail } from 'k6';
import { authHeaders } from './auth.${ext}';
import { BASE_URL } from './config.${ext}';

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 400, 401, 403, 404, 409, 429));

${typed}
  const url = path.startsWith('http') ? path : BASE_URL + path;
  const params = {
    headers: authHeaders(),
    tags: tags || { endpoint: method + ' ' + path },
    timeout: __ENV.HTTP_TIMEOUT || '60s',
  };
  const payload = body === undefined || body === null ? null : JSON.stringify(body);
  const res = http.request(method, url, payload, params);
  const ok = check(res, {
    'status is not 5xx': (r) => r.status < 500,
  });
  if (!ok && __ENV.FAIL_ON_CHECK === '1') {
    fail('request failed ' + method + ' ' + path + ' status=' + res.status);
  }
  return res;
}
`;
}

function mainTest(model: NormalizedApiModel, endpoints: Endpoint[], optionsJs: string, ext: string): string {
  const calls = endpoints.map((e) => renderCall(e, "    ")).join("\n");
  return `import { group, sleep } from 'k6';
import { request } from '../shared/http.${ext}';
import { RATE, DURATION, VUS } from '../shared/config.${ext}';

const fixtures = JSON.parse(open('../data/fixtures.json'));

export const options = ${optionsJs};

export function setup() {
  return { startedAt: Date.now() };
}

export default function () {
${calls}
  sleep(0.1);
}

export function teardown(_data${ext === "ts" ? ": unknown" : ""}) {}

// Generated from ${model.source.type}: ${model.source.path}
`;
}

function renderCall(endpoint: Endpoint, indent: string): string {
  const path = toRuntimePath(endpoint.path);
  const body = endpoint.requestBody ? `fixtures[${JSON.stringify(endpoint.id)}]` : "null";
  return `${indent}group(${JSON.stringify(endpoint.id)}, function () {
${indent}  request(${JSON.stringify(endpoint.method)}, ${path}, ${body}, { endpoint: ${JSON.stringify(endpoint.id)} });
${indent}});`;
}

function toRuntimePath(path: string): string {
  const replaced = path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const env = name.replace(/[^A-Za-z0-9]/g, "_").toUpperCase();
    return `' + (__ENV.${env} || '1') + '`;
  });
  return `'${replaced}'`;
}

export function renderOptionsJs(strategy: PerformanceStrategy): string {
  const scenarios = strategy.scenarios
    .map((s) => `    ${JSON.stringify(s.name)}: ${scenarioJs(s)}`)
    .join(",\n");
  const thresholds = strategy.thresholds
    .map((t) => `    ${JSON.stringify(t.metric)}: [${JSON.stringify(t.expression)}]`)
    .join(",\n");
  return `{
  scenarios: {
${scenarios}
  },
  thresholds: {
${thresholds}
  },
}`;
}

function scenarioJs(s: Scenario): string {
  const fields: string[] = [`executor: ${JSON.stringify(s.executor)}`];
  if (s.rate !== undefined) fields.push("rate: RATE");
  if (s.timeUnit) fields.push(`timeUnit: ${JSON.stringify(s.timeUnit)}`);
  if (s.duration) fields.push(`duration: DURATION || ${JSON.stringify(s.duration)}`);
  if (s.vus !== undefined) fields.push("vus: VUS || " + s.vus);
  if (s.preAllocatedVUs !== undefined) fields.push(`preAllocatedVUs: ${s.preAllocatedVUs}`);
  if (s.maxVUs !== undefined) fields.push(`maxVUs: ${s.maxVUs}`);
  if (s.stages) fields.push(`stages: ${JSON.stringify(s.stages)}`);
  return `{ ${fields.join(", ")} }`;
}

function workflowTest(endpoints: Endpoint[], workflows: Workflow[], optionsJs: string, ext: string): string {
  const byId = new Map(endpoints.map((e) => [e.id, e]));
  const blocks = workflows
    .map((wf) => {
      const steps = wf.steps
        .map((step) => {
          const ep = byId.get(step.endpointId);
          if (!ep) return "";
          const body = ep.requestBody ? `fixtures[${JSON.stringify(ep.id)}]` : "null";
          const pathExpr = toRuntimePathFromVars(ep.path, step.uses);
          const extracts = step.extracts
            .map((v) => {
              const cast = ext === "ts" ? " as Record<string, unknown>" : "";
              return `      try { const body = res.json()${cast}; if (body && body[${JSON.stringify(v)}] != null) vars[${JSON.stringify(v)}] = String(body[${JSON.stringify(v)}]); } catch (e) {}`;
            })
            .join("\n");
          return `    group(${JSON.stringify(step.id)}, function () {
      const res = request(${JSON.stringify(ep.method)}, ${pathExpr}, ${body}, { endpoint: ${JSON.stringify(ep.id)} });
${extracts}
    });`;
        })
        .join("\n");
      const varsAnnot = ext === "ts" ? ": Record<string, string>" : "";
      return `  group(${JSON.stringify(wf.name)}, function () {
    const vars${varsAnnot} = { id: __ENV.ITEM_ID || '1' };
${steps}
  });`;
    })
    .join("\n");

  return `import { group, sleep } from 'k6';
import { request } from '../shared/http.${ext}';
import { RATE, DURATION, VUS } from '../shared/config.${ext}';

const fixtures = JSON.parse(open('../data/fixtures.json'));

export const options = ${optionsJs};

export default function () {
${blocks}
  sleep(0.1);
}
`;
}

function toRuntimePathFromVars(path: string, uses: string[]): string {
  if (uses.length === 0) return toRuntimePath(path);
  const replaced = path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const key = uses.find((u) => u === name || u.toLowerCase() === name.toLowerCase()) ?? name;
    return `' + (vars[${JSON.stringify(key)}] || vars.id || __ENV.${name.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()} || '1') + '`;
  });
  return `'${replaced}'`;
}

function negativeTest(endpoints: Endpoint[], optionsJs: string, ext: string): string {
  const get = endpoints.find((e) => e.method === "GET");
  const write = endpoints.find((e) => Boolean(e.requestBody));
  return `import { check, group } from 'k6';
import http from 'k6/http';
import { BASE_URL, RATE, DURATION, VUS } from '../shared/config.${ext}';

export const options = ${optionsJs};

export default function () {
  group('401 unauthorized', function () {
    const res = http.get(BASE_URL + ${JSON.stringify(get?.path ?? "/")}, { tags: { negative: '401' } });
    check(res, { 'handled without 5xx': (r) => r.status < 500 });
  });
  group('404 not found', function () {
    const res = http.get(BASE_URL + '/__k6_missing_resource__', { tags: { negative: '404' } });
    check(res, { 'client error': (r) => r.status < 500 });
  });
${
  write
    ? `  group('400 invalid body', function () {
    const res = http.post(BASE_URL + ${JSON.stringify(write.path)}, '{', {
      headers: { 'Content-Type': 'application/json' },
      tags: { negative: '400' },
    });
    check(res, { 'client error': (r) => r.status < 500 });
  });`
    : ""
}
}
`;
}
