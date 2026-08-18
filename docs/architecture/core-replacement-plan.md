# Core Replacement Plan

## Goal

Make `knowledge-grounded-conversational-assistant/` the clean, reusable replacement for the generic capabilities of `conversational-assistant-2/`.

Each real assistant remains a simple self-hosted clone:

```text
lazaro-software/      Paula and UNICO
american-burger/      Maria and American Burger
my-custom-assistant/  future deployment
```

Every clone keeps its assistant-specific `app/`, `config/`, `.env`, and `runtime-data/` inside its own root. The Core repository contains only generic source, tests, contracts, templates, and documentation.

## Replacement standard

The Core is a replacement when a fresh clone can configure, digest knowledge, converse naturally, remember a chat, expose the REST/callback gateway, and operate safely without copying any legacy source file or modifying Core source for a specific assistant.

## Work plan

### Phase A — Parity baseline

Create a capability-by-capability mapping from the legacy project to the Core. Freeze the rule that legacy code is reused when generic, but never copied with Paula/UNICO paths, data, secrets, logs, or deterministic dialogue behavior.

Done when the extraction audit is current and every missing capability has an owner, source files, tests, and acceptance criteria.

### Phase B — Durable chat memory — Closed

Extract the legacy file-backed chat memory and its administrator cleanup command.

- Keep one snapshot per assistant/conversation/user scope.
- Keep configured expiry, bounded turns, safe facts, redaction, atomic writes, restart hydration, and failure isolation.
- Store records only under the clone's ignored, deployment-configured local memory directory.
- Integrate memory as untrusted continuity context, never factual evidence.

Completed on 2026-08-18. The Core now has scoped, file-backed memory; explicit expiry cleanup; redaction; bounded turns and summaries; atomic writes; restart hydration; and graceful read/write failure isolation. Unit and integration tests prove scope isolation, expiry, sensitive-data omission, concurrent writes, restart hydration, non-evidence separation, and failure isolation. Two independently configured deployment clones each retained a natural conversation across separate CLI processes after pulling Core commit `f6aea1e`.

### Phase C — Probabilistic conversation acceptance

Extract and harden generic live-transcript tooling.

- Persist a sanitized transcript after each completed turn.
- Support resumable 20-turn Spanish and English sessions.
- Record selected provider lane, typed failures, evidence state, language fit, and reviewer findings.
- Never require exact answer text or introduce reply templates.

Done when each deployment can run and review realistic twenty-turn conversations before human testing.

### Phase D — REST and callback gateway

Extract the legacy gateway, store, security, worker, and administration commands.

- Retain registered callers, request signatures, nonce protection, caller and callback allowlists, asynchronous jobs, callbacks, retry isolation, and source expansion.
- Keep channel systems as dumb terminals.
- Put all gateway operational records under local ignored `runtime-data/`.

Done when a WebChat-like caller can safely submit a turn and receive an asynchronous callback without deployment-specific Core code.

### Phase E — Operations and readiness

Extract only generic readiness, security, qualification, maintenance, and transcript-review commands.

Done when one command can verify a clone is ready for development testing and another can identify why it is not ready without exposing secrets or raw conversation content.

### Phase F — Replacement certification

Run the same generic acceptance suite against Paula and Maria.

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

Each phase is promoted in a small Core commit only after it is generic, tested, and free of deployment data. Paula and Maria receive every promotion with `git pull`; their local business packs are never committed to the Core repository.
