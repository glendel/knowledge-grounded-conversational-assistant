# Source Module Boundaries

`src/core/` contains portable primitives with no deployment awareness.

`src/security/` contains generic privacy and Core-boundary protections. It may validate an explicitly supplied Core root but must not discover or load a deployment.

`src/observability/` contains generic redaction and structured observation helpers. It must never write a deployment transcript by itself.

`src/contracts/` contains the generic strict JSON Schema registry. It validates Core-defined machine boundaries but must not load deployment configuration, durable deployment data, or temporary scratch data by itself.

`src/config/` validates a configuration directory explicitly supplied by a caller. It does not discover a configuration directory from the Core checkout.

`src/ai/` contains prose-first provider transport adapters, capability routing, and qualification validation. It accepts injected configuration, contracts, qualification evidence, and environment secrets; it must not embed a live provider route, model, or credential.

`src/knowledge/` contains the administration lifecycle only: source discovery, controlled extraction, redaction, drafting, review, explicit Human Administrator approval, approved-only indexing, and retrieval evaluation. It accepts an explicit deployment root, validated configuration, and loaded contracts. It must never discover a deployment from the Core checkout or expose raw sources or drafts to a runtime.

`src/deployment/` creates the one immutable, explicit Deployment Descriptor that binds an external deployment root or an explicit self-hosted clone root to Core contracts and validated deployment configuration. It must reject nested roots and must be the only deployment-path source for runtime modules.

`src/conversation/` provides approved-only retrieval, bounded context assembly, actual-text language selection, and a single prose-generation conversation loop. It must not read raw knowledge, discover deployment roots, invoke a dialogue tree, or demand JSON from normal user-facing prose.

`src/memory/` provides local, file-backed, chat-scoped continuity. It receives an explicit validated deployment root and validated configuration; it stores only bounded, redacted turns and explicitly safe facts. It must never become factual Knowledge Base evidence, global user profiling, or a reason to replace a natural response when storage is unavailable.

`src/evaluation/` provides the reusable probabilistic conversation-acceptance harness. It runs the normal conversation runtime, applies only outcome-level constraints, and persists redacted transient transcripts beneath an explicit deployment `tmp/` path. It must never compare expected prose, score a response through a dialogue tree, or silently approve a human quality decision.

`src/gateway/` provides the generic asynchronous REST/callback boundary for dumb terminals. It receives an explicit descriptor, stores strict durable records only in the deployment root, authenticates callers, validates callback allowlists, isolates caller scopes, and retries immutable callbacks without replaying a conversation. It must not trust terminal language hints, load a brand-specific caller, or add terminal-specific conversational behavior.

`src/deployment/provider-qualification-records.js` loads deployment-owned provider qualification evidence only from the selected deployment. It must not embed a model, provider lane, or credential in the Core.

Future modules for contracts, configuration, providers, knowledge, conversation, gateway, and operations work must preserve these boundaries. A module that needs deployment-owned files receives an explicit validated deployment-root dependency; it must not derive those files from the Core checkout.
