# Changelog

## 0.2.0 — 2026-09-12

### Added

- HAR 1.2 parser (`k6-agent analyze examples/har/sample.har`)
- OpenAPI `links` correlation into workflow tests
- k6 TypeScript output (`--lang ts`) with generated `tsconfig.json`
- Historical baseline store (`k6-agent baseline save|list|show`)
- Optional Influx/Prometheus k6 outputs and `k6-agent observability compose`
- Auto-save latest baseline after a successful run (compare before overwrite)

## 0.1.0 — 2026-09-12

### Added

- Initial public MVP: OpenAPI, Postman, cURL, and k6 parsers
- Normalized API model, orchestrator, and specialist agents
- k6 generator, reviewer, runner, reports, doctor, CI templates
- Cursor agents, commands, skills, personas, and workflows
- Mock API and automated tests
