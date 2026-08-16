# Knowledge-Grounded Conversational Assistant Core

This repository is the reusable white-label Core for one independently governed conversational-assistant deployment at a time.

It does not contain a real assistant identity, company, product, raw source document, approved Knowledge Base, conversation, credential, callback URL, or provider route. Those belong to a separate deployment pack.

```text
versioned Core + validated deployment root = one assistant deployment
```

The Core exists to make assistants natural, fluent, useful, and grounded in approved evidence. Deterministic code protects the conversation through validation, isolation, bounded context, safety, and observability; it does not replace model-led natural conversation with dialogue trees.

## Current phase

Phase 1 established the clean repository boundary. Phase 2.2 now adds the portable kernel: safe filesystem primitives, stable identifiers and result envelopes, redaction, Core boundary security, linting, and neutral unit/security tests.

Runtime contracts, provider adapters, knowledge administration, and deployment-root support remain intentionally staged for later audited batches. This repository still cannot run a real assistant.

## Repository rules

- Keep all Core source, documentation, contracts, tests, and examples business-neutral.
- Keep actual deployments outside this checkout.
- Never commit `.env`, keys, tokens, callback secrets, real URLs, raw sources, approved knowledge, transcripts, logs, memory, or runtime records.
- Use `app-template/` and `config/templates/` only as safe synthetic starting points.
- Run `npm run check` before staging a Core change. It runs the boundary, lint, unit, and security checks available at the current phase.

## Administrator workflow

1. Create or choose a deployment root outside this repository.
2. Supply its identity, purpose, approved knowledge, policies, provider choices, Golden Datasets, and secret references there.
3. Validate that deployment against the Core contracts and acceptance gates.
4. Promote an improvement to Core only when it is genuinely generic, sanitized, tested, and useful across deployments.

See [the Core repository charter](docs/architecture/core-repository-charter.md), [the portable-kernel architecture](docs/architecture/phase-2-portable-kernel.md), and [the extraction checklist](docs/operations/extraction-checklist.md).
