# Core Replacement Plan

## Goal

Make `knowledge-grounded-conversational-assistant/` the clean, reusable replacement for the generic capabilities of `conversational-assistant-2/`.

Each real assistant remains a simple self-hosted clone:

```text
support-assistant/  one configured support deployment
seller-assistant/   one configured product-guidance deployment
my-custom-assistant/  future deployment
```

Every clone keeps its assistant-specific `app/`, `config/`, `.env`, and `tmp/` inside its own root. Durable assistant data belongs in `app/`; `tmp/` is disposable. The Core repository contains only generic source, tests, contracts, templates, and documentation.

## Replacement standard

The Core is a replacement when a fresh clone can configure, digest knowledge, converse naturally, remember a chat, expose the REST/callback gateway, and operate safely without copying any legacy source file or modifying Core source for a specific assistant.

## Work plan

### Phase A — Parity baseline

Create a capability-by-capability mapping from the legacy project to the Core. Freeze the rule that legacy code is reused when generic, but never copied with deployment-specific paths, data, secrets, logs, or deterministic dialogue behavior.

Done when the extraction audit is current and every missing capability has an owner, source files, tests, and acceptance criteria.

### Phase B — Durable chat memory — Closed

Extract the legacy file-backed chat memory and its administrator cleanup command.

- Keep one snapshot per assistant/conversation/user scope.
- Keep configured expiry, bounded turns, safe facts, redaction, atomic writes, restart hydration, and failure isolation.
- Store records only under the clone's ignored, deployment-configured local memory directory.
- Integrate memory as untrusted continuity context, never factual evidence.

Completed on 2026-08-18. The Core now has scoped, file-backed memory; explicit expiry cleanup; redaction; bounded turns and summaries; atomic writes; restart hydration; and graceful read/write failure isolation. Unit and integration tests prove scope isolation, expiry, sensitive-data omission, concurrent writes, restart hydration, non-evidence separation, and failure isolation. Two independently configured deployment clones each retained a natural conversation across separate CLI processes after pulling Core commit `f6aea1e`.

### Phase C — Probabilistic conversation acceptance — Closed

Extract and harden generic live-transcript tooling.

- Persist a sanitized transcript after each completed turn.
- Support resumable 20-turn Spanish and English sessions.
- Record selected provider lane, typed failures, evidence state, language fit, and reviewer findings.
- Never require exact answer text or introduce reply templates.

Completed on 2026-08-18. The Core now provides a generic, model-led acceptance harness that stores a redacted checkpoint after every completed turn, records provider-lane evidence and deterministic outcome constraints, verifies resume identity with a dataset fingerprint, and requires an exclusive per-run lease. The lease prevents two processes from overwriting one acceptance record; a stale lease requires deliberate administrator recovery only after the prior process has stopped. The harness never evaluates exact reply wording or supplies dialogue-tree replies.

The closure evidence comprises four independent deployment runs: each of two deployments completed one twenty-turn Spanish conversation and one twenty-turn English conversation. All completed without automatic blockers, preserved natural provider-generated prose, and recorded primary/fallback lane evidence where applicable. Cross-language testing also hardened generic language detection for ordinary messages that do not contain narrow language markers. Deployment transcripts and datasets remain ignored deployment material; the generic closure record is [the Phase C closure certificate](phase-c-closure-certificate.md).

### Phase D — REST and callback gateway — Closed

Extract the legacy gateway, store, security, worker, and administration commands.

- Retain registered callers, request signatures, nonce protection, caller and callback allowlists, asynchronous jobs, callbacks, retry isolation, and source expansion.
- Keep channel systems as dumb terminals.
- Put durable gateway operational records under ignored `app/data/gateway/` and disposable diagnostics under ignored `tmp/`.

Completed on 2026-08-18. The Core now supplies a descriptor-bound, signed, asynchronous REST gateway for dumb terminals. It validates registered callers, signatures, timestamps, nonce replay prevention, idempotency, callback allowlists, and DNS/IP-safe callback delivery. Accepted jobs, immutable callback outcomes, nonce records, and source-expansion records remain under the deployment's ignored data directory. The worker holds an exclusive deployment lease so an accidental second process cannot claim or deliver the same work; explicit stale-lease recovery is available only after the previous worker is confirmed stopped.

Core integration tests prove signed intake, rejection of stale/replayed messages, immutable callback retry without repeating conversation work, caller-scoped source expansion, safe handling of untrusted language hints, and worker-lease behavior. A configured self-hosted deployment additionally completed a real provider-backed round trip: signed `202` intake, normal grounded model response, language determined from actual user text rather than the terminal hint, signed callback, and `204` delivery. The generic evidence and boundaries are recorded in [the Phase D closure certificate](phase-d-closure-certificate.md). Deployment-specific caller credentials, callback targets, and provider qualification remain local deployment responsibilities.

### Phase E — Operations and readiness

Extract only generic readiness, security, qualification, maintenance, and transcript-review commands.

Done when one command can verify a clone is ready for development testing and another can identify why it is not ready without exposing secrets or raw conversation content.

### Phase F — Replacement certification

Run the same generic acceptance suite against two independently configured deployments.

The certification requires:

1. Clean Core Git history with no business data.
2. A fresh clone can become a working assistant through local configuration only.
3. Natural grounded conversations work in Spanish and English.
4. Durable memory survives restart and expires correctly.
5. Provider primary/fallback behavior is observable and safe.
6. Gateway integration works with a dumb terminal.
7. Development coverage and production approval paths remain distinct.
8. All Core checks, contracts, security tests, and deployment acceptance tests pass.

## Promotion rule

Each phase is promoted in a small Core commit only after it is generic, tested, and free of deployment data. Independently configured deployments receive every promotion with `git pull`; their local business packs are never committed to the Core repository.
