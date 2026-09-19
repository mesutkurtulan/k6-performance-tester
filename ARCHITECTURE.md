# Architecture

**AI K6 Performance Agent** is an open-source performance engineering framework. It turns API definitions and existing requests into designed, reviewed, executable k6 tests, then explains the results.

It is not a Swagger-to-k6 converter. Deterministic parsers produce a **Normalized API Model**. Agents design strategy, generate tests, review safety, execute k6, and analyze results. AI is optional and never used for parsing, file I/O, k6 execution, or metric math.

## Positioning

```text
API Definition
      ↓
AI Performance Engineering
      ↓
Test Design
      ↓
K6
      ↓
Execution
      ↓
Analysis
      ↓
Reporting
```

## Component diagram

```text
┌─────────────┐   ┌──────────────┐   ┌─────────────┐
│  Parsers    │→  │  Normalizer  │→  │   Agents    │
│ OAS/Postman │   │  ApiModel    │   │ Orchestrator│
│ cURL/k6/HAR │   └──────────────┘   └──────┬──────┘
└─────────────┘                             │
        ┌───────────────────────────────────┼──────────────────────────┐
        ▼                                   ▼                          ▼
┌───────────────┐                  ┌────────────────┐         ┌──────────────┐
│ LLM Providers │                  │  K6 Generator  │         │   Runners    │
│ (optional)    │                  │  + templates   │         │ local/docker │
└───────────────┘                  └────────┬───────┘         └──────┬───────┘
                                            ▼                        ▼
                                   ┌────────────────┐         ┌──────────────┐
                                   │ Test Reviewer  │         │  Reporters   │
                                   │ Safety / HITL  │         │ HTML/MD/JSON │
                                   └────────────────┘         └──────────────┘
```

## Agent architecture

The **Orchestrator** delegates. It does not implement parser, generator, or runner logic.

```text
                    ORCHESTRATOR AGENT
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
 API Analyzer       Test Strategist     Environment Agent
        │                  │
        ▼                  ▼
 Workflow Agent      K6 Generator
        │                  │
        └──────────┬───────┘
                   ▼
              Test Reviewer
                   │
                   ▼
              Test Runner
                   │
                   ▼
           Result Analyzer
                   │
                   ▼
          Performance Analyst
                   │
                   ▼
             Report Agent
```

Supporting agents: Authentication, Test Data, Threshold, Regression, CI.

## Data flow

1. **Source detection** — OpenAPI, Postman, cURL, or existing k6.
2. **Parse** — deterministic, no LLM.
3. **Normalize** — `NormalizedApiModel` only. Generators never see raw OAS/Postman.
4. **Auth + workflow** — schemes, CRUD chains, correlation variables.
5. **Strategy** — smoke/load/stress/spike/soak/breakpoint with documented assumptions.
6. **Generate** — k6 modules, data fixtures, thresholds, coverage matrix.
7. **Review** — PASS / WARN / FAIL. Critical FAIL blocks run unless `--force`.
8. **Execute** — local or Docker k6; dry-run prints the plan.
9. **Analyze** — metrics, thresholds, optional AI narrative, optional regression.
10. **Report** — console, JSON, Markdown, HTML, JUnit, CSV, GitHub Summary.

## State model

Each run has a `RunState` persisted under `.agent/` when requested:

```json
{
  "runId": "uuid",
  "input": {},
  "apiModel": {},
  "auth": {},
  "workflows": [],
  "strategy": {},
  "generatedTests": [],
  "review": {},
  "execution": {},
  "results": {},
  "analysis": {},
  "reports": [],
  "decisions": [],
  "coverage": {}
}
```

Agents consume and produce typed slices of this state. Invalid AI JSON is retried, repaired, or failed — never passed through.

## Provider architecture

`LLMProvider` is the only AI contract:

| Implementation | Use |
| --- | --- |
| `OpenAIProvider` | OpenAI Chat Completions |
| `AnthropicProvider` | Anthropic Messages |
| `GeminiProvider` | Google Gemini |
| `OllamaProvider` | Local Ollama |
| `OpenAICompatibleProvider` | Custom base URL |
| `DisabledProvider` | Deterministic heuristics only |

Tiers: `fast`, `balanced`, `advanced`. Prompts live in `prompts/` and are versioned. Credentials are never sent to the model when they can be replaced by scheme names and env var names.

## Parser architecture

Parsers implement `ApiParser.parse(input) → ParseResult` and register by source type. `$ref` resolution, Postman folder trees, and cURL flag parsing are code. Semantic workflow naming may use AI when enabled.

Future parsers (HAR, Insomnia, GraphQL, AsyncAPI) only need to emit `NormalizedApiModel`.

## Generator architecture

The k6 generator reads **only** the normalized model + strategy + auth + test data. Output is modular:

```text
generated-tests/
  shared/     config, auth, http helpers
  data/       fixtures (no secrets)
  smoke|load|stress|spike|soak|workflows/
```

Thresholds always include `source` and `reason`. AI recommendations are never labeled as SLAs.

## Reporting architecture

Reporters implement `Reporter.write(results, analysis, dest)`. Grafana / Influx / Prometheus output is optional and not required to run the core.

## Security model

- Secrets never appear in generated source; only `__ENV.*`.
- Logs and reports mask `Authorization`, tokens, passwords, API keys.
- Production, DELETE, high VU/rate, and long soak tests require confirmation (`--yes` / `--force` in CI).
- Configurable safety caps: `maxVUs`, `maxRate`, `maxDuration`.
- LLM context is a summary of the API model, not raw credential-bearing collections when avoidable.

## Extensibility

Register new parsers, LLM providers, reporters, CI emitters, personas, and agents through the plugin registries in `src/plugins/`. Core orchestration stays unchanged.
