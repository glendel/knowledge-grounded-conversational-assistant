# Phase 2.2 — Portable Kernel

## Status

The portable-kernel batch establishes generic foundations that can be reused by every future deployment. It is intentionally not a conversational runtime and cannot load a deployment, call an AI provider, retrieve knowledge, store chat memory, or expose an HTTP gateway.

## Included capabilities

| Area | Capability |
|---|---|
| Core primitives | Immutable configuration support, typed operational errors, opaque identifiers, UTC timestamps, and stable result envelopes. |
| Safe storage | Relative-path validation, root confinement, symlink rejection, bounded reads, strict JSON, atomic writes, hashing, and bounded discovery. |
| Privacy | Detection and redaction of common sensitive data in text and observation payloads. |
| Repository security | Required ignore rules, forbidden deployment-path detection, optional deployment-term/path scanning, credential-value heuristics, and Core symlink rejection. |
| Quality | LF/UTF-8 and strict JSON linting, JavaScript syntax validation, portable unit tests, and security tests. |

## Boundaries

The following remain outside this batch:

- deployment-root selection and validation;
- actual deployment configuration and provider routes;
- contracts and contract registry;
- provider adapters and model qualification;
- raw-source ingestion, approved-knowledge retrieval, and knowledge administration;
- natural conversation runtime, memory, gateway, callbacks, and operational storage.

Those capabilities require the later contract/configuration batches and the explicit deployment-root model. Keeping them out of the portable kernel prevents the Core from accidentally inheriting one deployment's filesystem assumptions.

## Verification

```text
npm run check
```

At this phase the command runs Core boundary security, LF/UTF-8 and syntax linting, portable unit tests, and Core security tests. Future phases will extend it with contract, integration, and multi-deployment acceptance gates.

## Promotion rule

Any change to this kernel must remain independent of organization, assistant identity, assistant purpose, product, catalog, knowledge source, provider route, caller, or deployment path. If a change needs one of those facts, it belongs in a deployment pack or in the future deployment-root contract—not in this module.
