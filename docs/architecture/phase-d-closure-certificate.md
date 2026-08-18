# Phase D Closure Certificate — REST & Callback Gateway

## Status

Closed on 2026-08-18 for the reusable Core.

## North Star check

The gateway is a transport boundary, not a second conversational system. It passes a validated user turn into the normal model-led conversation runtime and returns its immutable result asynchronously. Deterministic code protects request authenticity, replay prevention, isolation, storage, callback safety, and delivery retry; it does not prescribe dialogue or replace natural provider-generated prose.

## Delivered Core capability

- Signed registered-caller turn intake with timestamp, nonce, idempotency, and body-integrity checks.
- Caller-scoped opaque conversation and user identifiers, so terminal namespaces cannot cross-contaminate runtime memory.
- Strict durable jobs, callback outbox records, nonce records, and bounded source-expansion records inside deployment-owned ignored data.
- Callback URL allowlists plus DNS/IP validation and pinned outbound delivery to resist server-side request forgery.
- Asynchronous `202` acknowledgement, immutable callback payloads, and callback-only retry that never repeats a completed conversation, retrieval, or memory write.
- Opt-in caller-scoped source expansion with an opaque short-lived token and presentation-safe output.
- One exclusive gateway worker lease per deployment, with deliberate stale-lease recovery only after an administrator confirms the previous worker is stopped.
- Explicit deployment descriptors and no Core discovery of a deployment root, caller, provider, assistant, or business data.

## Evidence

The Core suite passed with gateway coverage for signed intake, stale/replayed request rejection, idempotency, immutable callback retry, source-expansion caller binding, untrusted language-hint handling, qualification propagation, and exclusive worker leases. Boundary, contract, security, lint, and Phase 2 verification gates also passed.

One configured self-hosted deployment completed a live provider-backed integration run: a signed request received `202`; the normal runtime produced a grounded response; actual message text selected the language despite a conflicting terminal hint; the callback carried a valid signature and completed with `204`. No deployment name, credential, callback URL, transcript, provider route, or Knowledge Base was promoted to the Core.

## Honest limits and deployment gate

This certificate closes Core extraction, not production approval for every deployment. Before a deployment opens external testing, its administrator must configure its caller registry and secrets, restrict callback allowlists, qualify its provider route, run the local signed-callback test, and review its operational retention settings. If a provider is unavailable or unqualified, the gateway produces a safe configured unavailable result rather than exposing an internal failure.

## Next phase

Phase E extracts generic readiness, maintenance, review, and operational diagnosis commands without exposing deployment secrets or raw conversation data.
