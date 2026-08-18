# Phase D — REST & Callback Gateway

## Purpose

Expose one configured assistant to external systems while keeping those systems as dumb terminals. A terminal submits a signed user turn, receives a quick acknowledgement, and later receives exactly one signed callback containing the immutable result. The terminal does not own conversation logic, retrieval, memory, provider selection, security policy, or handoff behavior.

## Core boundary

The Core supplies generic transport code, strict contracts, validation, isolated durable records, retry behavior, and administrator commands. A deployment supplies its own caller registry, callback allowlist, secrets, assistant data, approved Knowledge Base, provider route, and environment.

```text
Outside terminal
  -> signed POST /v1/turns
  -> validated caller + nonce + callback target
  -> durable gateway job under app/data/gateway/
  -> normal Conversation Runtime
  -> immutable callback outbox record
  -> signed callback POST to the registered target
```

## Security model

- Each registered caller has separate inbound and outbound secret environment-variable names.
- Inbound signatures cover method, endpoint, timestamp, nonce, idempotency key, and SHA-256 body hash.
- A nonce is single-use within its configured retention window. An idempotency key returns the original acknowledgement only when the body hash is identical.
- Caller and callback URL are both validated. Callback hosts and path prefixes must appear in the caller's allowlist.
- HTTPS is mandatory except an explicitly configured `localhost` HTTP target in a non-production deployment.
- Callback DNS resolution rejects loopback, private, link-local, documentation, and other non-public addresses except that explicit development exception. The outbound request is pinned to the validated address while preserving the expected host/SNI name.
- Caller-supplied `languageHint` is not trusted by the conversation runtime. Actual user text determines the runtime language.
- Jobs map caller-local conversation and user IDs to opaque scoped runtime identifiers so terminal namespaces cannot collide.

## Durable and temporary data

Gateway jobs, nonce records, source-expansion records, and callback outbox records live only under the deployment-owned `app/data/gateway/` directory. They are strict JSON, atomic, bounded, and disposable only according to configured retention cleanup. Diagnostics belong under `tmp/`; no records belong in the Core repository.

## Runtime behavior

- `POST /v1/turns` responds `202` with an acknowledgement after secure durable acceptance.
- A worker processes the normal conversational runtime asynchronously, preserving accepted order inside each caller/conversation/user scope while allowing independent chats to progress.
- A successful callback is immutable. Retry attempts never invoke the model, retrieval, or chat-memory write a second time.
- A technical runtime failure produces a typed durable failure and a polite configured unavailable callback; internal technical codes never appear in user-facing callback text.
- Source expansion is opt-in per caller. The callback carries only an opaque short-lived token; a signed `POST /v1/source-expansions` can retrieve a bounded presentation-safe source list for that same caller.

## Operator commands

```text
node --env-file-if-exists=.env ./bin/gateway-service.js --deployment-root <absolute-deployment-root> --host 127.0.0.1 --port 3000
node --env-file-if-exists=.env ./bin/gateway-service.js --deployment-root <absolute-deployment-root> --process-once
node --env-file-if-exists=.env ./bin/admin-gateway.js --deployment-root <absolute-deployment-root> jobs
node --env-file-if-exists=.env ./bin/admin-gateway.js --deployment-root <absolute-deployment-root> callbacks
node --env-file-if-exists=.env ./bin/admin-gateway.js --deployment-root <absolute-deployment-root> cleanup
```

## Acceptance criteria

Phase D is ready for a deployment test when the Core checks pass and a configured self-hosted deployment proves signed asynchronous intake, signed callback delivery, replay rejection, duplicate idempotency, callback retry without duplicate conversation work, and caller-scoped source expansion.
