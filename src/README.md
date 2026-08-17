# Source Module Boundaries

`src/core/` contains portable primitives with no deployment awareness.

`src/security/` contains generic privacy and Core-boundary protections. It may validate an explicitly supplied Core root but must not discover or load a deployment.

`src/observability/` contains generic redaction and structured observation helpers. It must never write a deployment transcript by itself.

`src/contracts/` contains the generic strict JSON Schema registry. It validates Core-defined machine boundaries but must not load deployment configuration or runtime data by itself.

`src/config/` validates a configuration directory explicitly supplied by a caller. It does not discover a configuration directory from the Core checkout.

`src/ai/` contains prose-first provider transport adapters, capability routing, and qualification validation. It accepts injected configuration, contracts, qualification evidence, and environment secrets; it must not embed a live provider route, model, or credential.

`src/knowledge/` contains the administration lifecycle only: source discovery, controlled extraction, redaction, drafting, review, explicit Human Administrator approval, approved-only indexing, and retrieval evaluation. It accepts an explicit deployment root, validated configuration, and loaded contracts. It must never discover a deployment from the Core checkout or expose raw sources or drafts to a runtime.

Future modules for contracts, configuration, providers, knowledge, conversation, memory, and gateway work must preserve these boundaries. A module that needs deployment-owned files receives an explicit validated deployment-root dependency in a later phase; it must not derive those files from the Core checkout.
