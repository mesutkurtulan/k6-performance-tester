# Implementation Plan

MVP version: **0.1.0**. Public API is not stable until 1.0.0.

## Phase 1 — Repository foundation

- [x] Inspect repo (empty)
- [x] `ARCHITECTURE.md`
- [x] Package, TypeScript, ESLint, Prettier, Vitest
- [x] Open-source files (MIT, README, CONTRIBUTING, SECURITY, CoC)

## Phase 2 — Core models and config

- [x] Zod schemas: API model, strategy, workflows, thresholds, review, results, analysis
- [x] Config loader: YAML / JSON / `.env`
- [x] Safety limits, personas, logging, secret masking

## Phase 3 — Parsers and normalizer (deterministic)

- [x] OpenAPI 3.x + Swagger 2.x (JSON/YAML, `$ref`)
- [x] Postman Collection v2.1 + variable mapping
- [x] cURL (common flags, multi-command files)
- [x] Existing k6 HTTP call extraction
- [x] Normalized API model

## Phase 4 — MVP pipeline

- [x] Performance strategy (deterministic defaults + optional AI)
- [x] k6 generator (scenarios, checks, tags, thresholds, env, shared modules)
- [x] Test data + threshold agents
- [x] Reviewer (secrets, missing checks, production safety)
- [x] Local k6 runner + dry-run
- [x] Result normalizer
- [x] Console / JSON / Markdown / HTML reports

## Phase 5 — Additional inputs and agents

- [x] Orchestrator + remaining agents
- [x] Regression compare
- [x] JUnit, CSV, GitHub Summary
- [x] CI generators (GitHub Actions, Jenkins, GitLab)
- [x] Doctor, init, full-test, explain

## Phase 6 — Cursor pack

- [x] `.cursor/agents`, `commands`, `skills`, `personas`, `workflows`

## Phase 7 — Tests and examples

- [x] Unit: parsers, secrets, thresholds, strategy
- [x] Integration: OAS/Postman/cURL → model → k6
- [x] Mock API + e2e generate/report
- [x] Petstore, Postman, cURL, ecommerce, TM Forum examples

## Independent tasks (for contributors)

- [x] HAR parser
- [x] Optional Grafana/Influx/Prometheus k6 `--out` (not a required dependency)
- [x] Persist historical baselines in `.agent/baselines`
- [x] k6 TypeScript output (`--lang ts`)
- [x] Correlation from OpenAPI `links`

## Phase 8 — 0.2.0

- [x] HAR input
- [x] OpenAPI links workflows
- [x] TypeScript generation
- [x] Baseline CLI
- [x] Optional observability compose

## Next (0.3.x)

- Insomnia / GraphQL parsers
- xk6-dashboard HTML live view
- Baseline store with multiple environments and Git LFS-friendly layout
- Existing k6 auto-extend (add scenarios without rewrite)

