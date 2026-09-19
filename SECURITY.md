# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.x | Yes |

## Reporting a vulnerability

Please use GitHub Security Advisories. Do not file public issues for credential leaks or RCE.

## Hard rules for this codebase

- Never commit API keys, tokens, or `.env` files
- Generated k6 must use `__ENV.*` only
- Reports and logs must mask `Authorization`, passwords, and API keys
- Do not send raw credential-bearing collections to an LLM when a redacted model exists
- Production and destructive tests require explicit confirmation
