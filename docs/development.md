# Developer notes

- `src/parsers` — deterministic input adapters
- `src/agents` — orchestrator and specialists
- `src/providers/llm` — provider-independent AI
- `src/reporters` — CI-friendly outputs
- Tests live in `tests/unit`, `tests/integration`, `tests/e2e`

Run `node dist/cli/index.js doctor` after `npm run build`.
