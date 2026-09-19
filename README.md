# AI K6 Performance Agent

An open-source **AI-powered performance engineering framework** that converts API definitions and existing API requests into intelligent, executable **k6** performance tests and explains the results.

It is not a Swagger-to-k6 converter.

```text
API Definition → AI Performance Engineering → Test Design → K6 → Execution → Analysis → Reporting
```

## Why it exists

Performance tests are often copied, under-designed, or disconnected from how the API actually works. This framework:

1. Parses OpenAPI, Postman, cURL, and existing k6 **deterministically**
2. Normalizes every input into one **API model**
3. Discovers workflows, auth, and data dependencies
4. Designs smoke/load/stress/spike/soak scenarios with **documented assumptions**
5. Generates maintainable k6 code (no hard-coded secrets)
6. Reviews tests, runs them, and explains metrics by **persona**

AI is optional. Parsing, k6 execution, and metric math never go through an LLM.

## Features

- OpenAPI 3.x / Swagger 2.x, Postman v2.1, cURL, HAR, existing k6
- Provider-independent LLM layer (OpenAI, Anthropic, Gemini, Ollama, OpenAI-compatible, or disabled)
- Orchestrator + specialized agents
- Safety gates for production, DELETE, and high load
- Reports: console, JSON, Markdown, HTML, JUnit, CSV, GitHub Summary
- CI generators for GitHub Actions, Jenkins, GitLab
- Cursor agents, commands, skills, personas, and workflows

## Installation

```bash
git clone <this-repo>
cd k6-performance-tester
npm install
npm run build
npx k6-agent doctor
```

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) to execute tests. Generation, review, and reporting work without k6.

```bash
npm link   # optional: installs the k6-agent binary
```

## Quick start

```bash
k6-agent generate examples/openapi/petstore.yaml --type load
k6-agent review ./generated-tests
k6-agent run ./generated-tests/load/main.js --env BASE_URL=http://127.0.0.1:4010 --report html,markdown,json
k6-agent report ./results --format html
```

Start the bundled mock API first if you want a local target:

```bash
npm run build
node dist/mock-api/cli.js
```

### Demo

Input: `openapi.yaml`

```bash
k6-agent generate examples/openapi/petstore.yaml --type load
```

Output:

```text
✓ API analyzed
✓ Authentication detected
✓ 6 endpoints discovered
✓ 1 workflows identified
✓ Load scenario designed
✓ k6 tests generated
✓ Thresholds generated
✓ Review PASS
```

Generated layout:

```text
generated-tests/
  shared/config.js
  shared/auth.js
  shared/http.js
  data/fixtures.json
  load/main.js
  load/negative.js
  workflows/main.js
```

Full cycle:

```bash
k6-agent full-test examples/openapi/petstore.yaml --type smoke --skip-run
```

## OpenAPI

```bash
k6-agent analyze examples/openapi/petstore.yaml
k6-agent generate examples/openapi/petstore.yaml --type load --p95 400
```

Supports OpenAPI 3.x and Swagger 2.x (JSON or YAML) including `$ref` resolution.

## Postman

```bash
k6-agent generate examples/postman/sample-collection.json --type smoke
```

`{{baseUrl}}` / `{{token}}` map to `__ENV.BASE_URL` / `__ENV.API_TOKEN`. Unconverted Postman scripts are listed under `unsupported`.

## cURL

```bash
k6-agent generate examples/curl/sample.sh --type smoke
```

## HAR

```bash
k6-agent generate examples/har/sample.har --type smoke
```

Captured `Authorization` values are not copied into tests; generated scripts use `__ENV.API_TOKEN`.

## TypeScript k6 output

```bash
k6-agent generate examples/openapi/petstore.yaml --type load --lang ts
k6-agent run generated-tests/load/main.ts --yes
```

k6 0.52+ compiles TypeScript via esbuild. A `tsconfig.json` is emitted for editors.

## Baselines

```bash
k6-agent baseline save reports/summary.json --name petstore-dev
k6-agent baseline list
k6-agent run generated-tests/load/main.js --compare-baseline petstore-dev
k6-agent compare ./reports/summary.json ./.agent/baselines/petstore-dev.json
```

Successful runs auto-save `.agent/baselines/latest.json` unless `--no-save-baseline`.

## Generated k6

Tests use environment variables, checks, tags, thresholds, groups, and shared auth. Example:

```javascript
const BASE_URL = __ENV.BASE_URL;
export const options = {
  scenarios: {
    load: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 10),
      timeUnit: '1s',
      duration: __ENV.DURATION || '5m',
      preAllocatedVUs: 5,
      maxVUs: 50,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};
```

Thresholds always include a **source** and **reason**. AI recommendations are never presented as SLAs.

## Running tests

```bash
k6-agent run generated-tests/load/main.js \
  --environment test \
  --env BASE_URL=https://test.example.com \
  --env RATE=50 \
  --env DURATION=2m \
  --report all

k6-agent run generated-tests/load/main.js --dry-run
```

Production, DELETE, soak, and over-limit tests require `--yes` or `--force`.

## Reporting

```bash
k6-agent report path/to/summary.json --format html,markdown,json,junit
k6-agent compare ./results/current.json ./results/baseline.json --tolerance 10
```

Grafana / Influx / Prometheus are optional and not required.

```bash
k6-agent observability compose
# optional: observability.influxdbUrl in k6-agent.yaml → k6 --out influxdb=...
```

## AI providers

```yaml
ai:
  provider: disabled   # openai | anthropic | gemini | ollama | openai-compatible
  tier: balanced       # fast | balanced | advanced
  models:
    fast: gpt-4.1-mini
    balanced: gpt-4.1
    advanced: gpt-4.1
```

Copy `.env.example` to `.env`. Leave `AI_PROVIDER=disabled` for fully deterministic runs.

## Configuration

See `config/default.yaml`. Also supported: `k6-agent.yaml`, `.env`.

```yaml
safety:
  maxVUs: 100
  maxRate: 500
  maxDuration: 30m
  productionRequiresConfirmation: true
  destructiveEndpointsRequireConfirmation: true
```

## Personas

```bash
k6-agent analyze results.json --persona performance-engineer
k6-agent --persona pm report ./summary.json
```

Personas: `qa`, `performance-engineer`, `developer`, `devops`, `qa-lead`, `architect`, `pm`.

## Agents, commands, skills

Runtime agents live in `src/agents/`. Cursor definitions live in `.cursor/`.

CLI: `init`, `analyze`, `generate`, `review`, `run`, `report`, `compare`, `ci`, `doctor`, `config`, `agent`, `full-test`, `explain`.

## CI/CD

```bash
k6-agent ci generate github
k6-agent ci generate gitlab
k6-agent ci generate jenkins
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Security

- No credentials in generated source
- Secret masking in logs and reports
- Reviewer fails on hard-coded tokens
- See [SECURITY.md](SECURITY.md)

## Contribution

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Roadmap

- HAR / Insomnia / GraphQL parsers
- Historical baseline store
- Optional Grafana remote write
- k6 TypeScript project template

License: [MIT](LICENSE)
