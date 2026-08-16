# Core Administration Entry Point

## Project identity

This repository is the reusable, white-label Core of a Knowledge-Grounded Conversational Assistant. It is not a deployment repository and it is not a multi-tenant service.

Its portability model is:

```text
one Core release + one deployment root = one independently governed assistant
```

The Core must support multiple assistant purposes through deployment data and policies, including support, advisory, seller, onboarding, and internal knowledge assistance. No purpose, brand, company, product, catalog, policy, or assistant name may be hard-coded in Core source, tests, examples, or root documentation.

## North Star

Build assistants that have natural, fluent, useful, evidence-grounded conversations in their configured domain. The model owns normal user-facing prose. Deterministic code is limited to protective boundaries: input validation, deployment isolation, approved-knowledge handling, bounded context, security, memory integrity, observability, and safe failure behavior.

## Core versus deployment

Core-owned content includes generic source code, provider adapters, contracts, schemas, validators, templates, tests, and generic documentation.

Deployment-owned content includes identity, purpose, actual configuration, approved knowledge, raw sources, provider routes, evaluation cases, policies, callers, secrets, runtime state, transcripts, and logs. It must remain outside this checkout.

## Required checks

Run `npm run check` before staging changes. The current check protects repository boundaries; later phases will add lint, contract, unit, integration, security, and multi-deployment acceptance checks.

## Rules

- Preserve UTF-8 without BOM and LF line endings.
- Never add secrets or actual deployment data to this repository.
- Never copy Git history from a deployment repository.
- Use synthetic, neutral fixtures only.
- Do not add a feature merely because one deployment needs it; first determine whether configuration, policy, or deployment knowledge solves it. Change Core source only for reusable capability improvements.
- Keep deployment-root selection explicit and validated once the runtime is introduced.
- Stop and correct the change if a boundary check fails or any deployment information appears in Core-tracked files.

Read [README.md](README.md), then the architecture charter and extraction checklist before performing work.
