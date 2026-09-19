# Contributing

Thank you for helping improve AI K6 Performance Agent.

## Development

```bash
npm install
npm test
npm run lint
npm run build
```

## Guidelines

- Keep parsers, k6 execution, and metric calculations **deterministic**.
- Do not send secrets to LLMs.
- Validate AI output with Zod schemas; never pass invalid JSON downstream.
- New input formats implement `parseContents` → `NormalizedApiModel` only.
- New reporters implement the `renderReport` format union.
- Add unit tests next to the behavior you change.

## Pull requests

- Small, reviewable diffs
- Update CHANGELOG.md
- Do not commit `.env`, credentials, or generated `reports/` artifacts
