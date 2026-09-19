---
name: har-analysis
description: Parse HTTP Archive (HAR) captures into the normalized API model. Use when the user provides a .har file or browser network export.
---

# har-analysis

## Instructions
Use the deterministic HAR parser in `src/parsers/har.ts`. Deduplicate by method+path. Map Authorization to env vars. Never copy captured tokens into generated tests.
