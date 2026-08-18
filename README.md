# Knowledge-Grounded Conversational Assistant Core

This repository is the reusable white-label Core for independently governed conversational-assistant deployments.

It tracks no real assistant identity, company, product, raw source document, approved Knowledge Base, conversation, credential, callback URL, or provider route. Those belong to deployment-owned material.

```text
versioned Core + validated deployment material = one assistant deployment
```

The Core exists to make assistants natural, fluent, useful, and grounded in approved evidence. Deterministic code protects the conversation through validation, isolation, bounded context, safety, and observability; it does not replace model-led natural conversation with dialogue trees.

## Current status

Phase 3 is closed. It delivered the explicit deployment-root model and the first natural, prose-first conversation runtime under the [North Star Conversation Quality Standard](docs/architecture/north-star-conversation-quality-standard.md). The [Phase 3 closure certificate](docs/architecture/phase-3-closure-certificate.md) records the evidence, scope, and limitations.

The Core now also provides durable, local, scoped chat continuity. It persists only bounded and redacted recent turns plus explicitly safe chat facts, expires it under deployment-configured retention, and never treats it as approved Knowledge Base evidence. An unreadable or unwritable memory record is observed without replacing natural model-led conversation.

Phase C is closed: the Core has a generic probabilistic conversation-acceptance harness for deployment-owned twenty-turn scenarios. It stores redacted checkpoints only inside the deployment `tmp/` directory, records actual provider-lane evidence, supports safe resume with a dataset fingerprint, and uses an exclusive per-run lease to prevent concurrent resume corruption. It checks outcome constraints such as language, evidence state, and minimum reply length; it never dictates reply wording. See the [Phase C closure certificate](docs/architecture/phase-c-closure-certificate.md). Learning, tools, and additional channels remain later phases.

Phase D adds a generic asynchronous REST and callback gateway for dumb terminals. It accepts only signed, registered-caller requests; stores deployment-owned jobs and callbacks under `app/data/gateway/`; isolates caller scopes; validates callback destinations; and retries immutable callbacks without rerunning a conversation. See the [Phase D architecture](docs/architecture/phase-d-rest-callback-gateway.md).

The Core contains no tracked active provider lane, model choice, credential, caller, or real Knowledge Base. It supports both an explicit external deployment root and an explicit self-hosted deployment root equal to the clone root. Runtime retrieval and real conversation are available once an administrator supplies and validates local deployment material.

## Repository rules

- Keep all Core source, documentation, contracts, tests, and examples business-neutral.
- Never commit `.env`, keys, tokens, callback secrets, real URLs, raw sources, approved knowledge, transcripts, logs, memory, runtime records, or actual `app/` / `config/*.json` files.
- Use `app-template/` and `config/templates/` only as safe synthetic starting points. A self-hosted clone copies them into ignored local paths.
- Run `npm run check` before staging a Core change. It runs the boundary, custom file-integrity lint, ESLint, unit, contract, and security checks available at the current phase.

## Administrator workflow

1. Choose either an external deployment root or a self-hosted clone.
2. For a self-hosted clone, run `node ./bin/initialize-self-hosted-deployment.js --deployment-root <absolute-clone-root>`.
3. Supply the assistant identity, purpose, approved knowledge, policies, provider choices, Golden Datasets, and secret references in deployment-owned material.
4. Validate that deployment against the Core contracts and acceptance gates.
5. Promote an improvement to Core only when it is genuinely generic, sanitized, tested, and useful across deployments.

To remove expired local chat-memory snapshots explicitly, run:

```text
node ./bin/admin-memory.js --deployment-root <absolute-deployment-root> cleanup
```

See [the Core repository charter](docs/architecture/core-repository-charter.md), [the recovery and portability model](docs/architecture/recovery-and-portability-model.md), [the self-hosted deployment design](docs/architecture/phase-4-self-hosted-deployment-mode.md), [the Phase 3 closure certificate](docs/architecture/phase-3-closure-certificate.md), and [the North Star Conversation Quality Standard](docs/architecture/north-star-conversation-quality-standard.md).
