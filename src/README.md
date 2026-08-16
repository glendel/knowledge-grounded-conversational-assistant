# Source Module Boundaries

`src/core/` contains portable primitives with no deployment awareness.

`src/security/` contains generic privacy and Core-boundary protections. It may validate an explicitly supplied Core root but must not discover or load a deployment.

`src/observability/` contains generic redaction and structured observation helpers. It must never write a deployment transcript by itself.

Future modules for contracts, configuration, providers, knowledge, conversation, memory, and gateway work must preserve these boundaries. A module that needs deployment-owned files receives an explicit validated deployment-root dependency in a later phase; it must not derive those files from the Core checkout.
