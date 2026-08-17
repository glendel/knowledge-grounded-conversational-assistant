# Source Module Boundaries

`src/core/` contains portable primitives with no deployment awareness.

`src/security/` contains generic privacy and Core-boundary protections. It may validate an explicitly supplied Core root but must not discover or load a deployment.

`src/observability/` contains generic redaction and structured observation helpers. It must never write a deployment transcript by itself.

`src/contracts/` contains the generic strict JSON Schema registry. It validates Core-defined machine boundaries but must not load deployment configuration or runtime data by itself.

`src/config/` validates a configuration directory explicitly supplied by a caller. It does not discover a configuration directory from the Core checkout.

`src/ai/` contains prose-first provider transport adapters, capability routing, and qualification validation. It accepts injected configuration, contracts, qualification evidence, and environment secrets; it must not embed a live provider route, model, or credential.

Future modules for contracts, configuration, providers, knowledge, conversation, memory, and gateway work must preserve these boundaries. A module that needs deployment-owned files receives an explicit validated deployment-root dependency in a later phase; it must not derive those files from the Core checkout.
