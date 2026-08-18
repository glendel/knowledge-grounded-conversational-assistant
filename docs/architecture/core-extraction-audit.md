# Core Extraction Audit

## Purpose

This ledger compares the legacy deployment implementation in `conversational-assistant-2/` with the reusable Core. Its job is to prevent duplicate work, business leakage, and reintroduction of deterministic conversational behavior.

The North Star remains unchanged: model-led, natural, fluent, useful conversations grounded in the configured deployment Knowledge Base. Deterministic code may protect validation, isolation, retrieval integrity, memory integrity, transport security, and observability; it must not become a dialogue tree.

## Current decision matrix

| Capability | Legacy evidence | Core status | Extraction decision |
|---|---|---|---|
| Deployment isolation and self-hosted clone mode | Legacy used one project root | Present: deployment descriptor, ignored local packs, initializer | Already promoted and hardened |
| Provider adapters, routes, fallbacks, and qualification | `src/ai/`, `bin/provider-probe.js` | Present | Already promoted; qualify routes per deployment |
| Prose-first conversation and approved retrieval | `src/conversation/` | Present with dedicated context assembly and output protections | Already promoted; stress-test with real transcripts |
| Knowledge administration | `src/knowledge/`, `bin/admin-knowledge.js` | Present with explicit deployment CLI | Already promoted; development coverage release added for test packs |
| Durable chat memory | `src/memory/chat-memory-repository.js`, `bin/admin-memory.js` | Present | Promoted and live-verified in two independently configured deployment clones after separate-process restart tests |
| REST and callback gateway | `src/gateway/`, `bin/gateway-service.js`, `bin/admin-gateway.js` | Missing | Promote after durable memory; rework against explicit deployment descriptor and self-hosted boundaries |
| Gateway security and caller administration | `src/gateway/gateway-security.js`, `registered-callers.json` | Missing | Extract only with signed requests, allowlists, nonce isolation, async callbacks, and tests |
| Readiness and production operations | `bin/readiness.js`, `bin/security-check.js`, validation scripts | Partial Core checks only | Rework into generic Core readiness gates after gateway extraction |
| Transcript evaluation and acceptance tests | legacy `tests/acceptance/` and milestone verification scripts | Missing | Promote as a generic probabilistic conversation harness; do not reuse business fixtures or exact-response assertions |
| Legacy project-root discovery | `bin/project-root.js` | Deliberately absent | Do not promote: Core requires explicit deployment roots |
| Legacy Milestone verifier scripts | `bin/verify-milestone-*.js` | Superseded by Core checks | Do not promote verbatim; retain only generic assertions when needed |
| Business packs, raw sources, approved documents, logs, memory, callbacks, secrets | legacy `app/`, `.env`, temporary scratch | Deployment-owned | Never promote to Core |

## Extraction order

1. Durable chat memory: complete. The generic file-backed, retention-bounded, conversation/user-isolated capability is promoted and live-verified in both initial deployments.
2. Probabilistic transcript harness: make twenty-turn live conversations observable, resumable, provider-lane-aware, and evaluation-oriented without demanding fixed assistant wording.
3. REST/callback gateway: extract transport as dumb-terminal integration, preserving signed requests, caller/callback allowlists, nonce protection, asynchronous jobs, and retry isolation.
4. Operations: add deployment-level readiness, transcript reconstruction, and safe review queues.

Every promoted batch must be generic, contract-backed, test-backed, and runnable by both the Paula and Maria deployments after `git pull`. A legacy implementation is evidence and a candidate, not authority to copy unchanged.

## File-level extraction manifest

| Legacy source | Core destination | Phase | Decision and verification |
|---|---|---|---|
| `src/ai/*`, `bin/provider-probe.js` | `src/ai/*`, `bin/provider-probe.js` | Complete | Promoted. Verify qualified primary/fallback routes in each clone. |
| `src/conversation/*`, `bin/chat-cli.js` | `src/conversation/*`, `bin/chat-cli.js` | Complete | Promoted as prose-first runtime. Verify natural grounded transcript behavior. |
| `src/knowledge/knowledge-administration.js`, `bin/admin-knowledge.js` | Same paths | Complete | Promoted with explicit-root CLI and development coverage release. |
| `src/memory/chat-memory-repository.js` | `src/memory/chat-memory-repository.js` | Complete | Promoted as a generic descriptor-backed repository; records remain only under the configured ignored deployment directory. |
| `bin/admin-memory.js` | `bin/admin-memory.js` | Complete | Promoted as explicit expiry-cleanup tooling. |
| `context/contracts/chat-memory-*.json` | `context/contracts/chat-memory-*.json` | Complete | Already present and now exercised by the promoted repository and tests. |
| `src/gateway/gateway-security.js` | `src/gateway/gateway-security.js` | D | Promote first; test signatures, nonces, caller and callback allowlists. |
| `src/gateway/gateway-store.js`, `gateway-runtime.js`, `gateway-server.js` | Same paths | D | Promote after security and descriptor integration; keep durable records in `app/data/gateway/` and diagnostics in `tmp/`. |
| `bin/gateway-service.js`, `bin/admin-gateway.js` | Same paths | D | Promote as generic dumb-terminal operations. |
| `bin/readiness.js`, `security-check.js`, `validate-provider-qualification.js` | `bin/` and/or `tools/` | E | Rework into Core checks that accept one clone root and expose no deployment data. |
| `tests/acceptance/*`, live scripts, milestone verifiers | `tests/acceptance/`, `tools/` | C/E | Extract assertions and harness behavior, never exact reply text, business fixtures, or milestone branding. |
| `bin/project-root.js`, `app/`, `.env`, legacy logs and temporary scratch | None | Never | Explicitly excluded from Core. |
