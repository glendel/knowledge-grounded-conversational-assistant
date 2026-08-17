# Phase 2.5 — Generic Knowledge Administration

## Status

Implemented as a Core capability. It has no command-line entry point and cannot select a deployment on its own. A deployment-owned administrator workflow will be introduced only after the explicit deployment-root model is completed in Phase 3.

## Outcome

The Core provides a governed lifecycle for synthetic or deployment-owned knowledge:

```text
registered raw source
-> controlled extraction and sensitive-value redaction
-> AI-assisted analysis and draft scaffold
-> review validation
-> explicit Human Administrator approval
-> approved-only indexes
-> retrieval evaluation
```

The model or an AI Administrator may help analyze a source and prepare a draft. It cannot silently approve a document, bypass provenance, or make raw source text available to a conversational runtime.

## Explicit boundary

`createKnowledgeAdministration` requires all of the following:

- `deploymentRoot`: an explicit, existing, symlink-free deployment root supplied by the caller;
- `configuration`: a validated complete Core configuration;
- `contracts`: a loaded Core contract registry.

The Core constructor does not derive a path from its own checkout, does not read a live configuration directory, and does not load real knowledge. This keeps a versioned Core release separable from every deployment pack.

## Lifecycle guarantees

- Source bytes are fingerprinted during scan and must be unchanged before extraction.
- Source type, file size, nesting, count, extraction text, and segment budgets are enforced.
- Symbolic links are rejected in governed paths.
- Extraction artifacts retain source and segment provenance.
- Drafts begin with explicit unresolved-curation markers and are ineligible for approval.
- A Human Administrator must provide the exact approval declaration and complete privacy, freshness, and authority review.
- Every approved claim needs evidence from at least one authoritative active source.
- Only validated `approved` records participate in lexical and relationship indexes.
- An invalid draft cannot block or contaminate an approved-only index rebuild.
- Evaluation cases test whether approved knowledge is retrievable; they do not use raw material.

## What this deliberately does not do

- It does not call an AI provider.
- It does not infer that a source is true, current, or authoritative.
- It does not promote an AI draft to approved knowledge.
- It does not retrieve knowledge for a user turn.
- It does not ship source documents, approved knowledge, indexes, or evaluation cases in this Core repository.

Those are deployment-owned concerns. Conversation retrieval and the user-facing runtime remain Phase 3 work and must meet the North Star Conversation Quality Standard before any deployment claims natural, fluent assistant behavior.

## Phase 2.5 verification

Synthetic lifecycle tests prove:

1. an explicit temporary deployment root can complete scan, classification, extraction, curated review, human approval, index creation, and bilingual evaluation;
2. extracted sensitive candidates are redacted;
3. malformed, unsupported, oversized, tampered, stale, incomplete, and relationship-invalid records fail closed;
4. raw source and unfinished drafts cannot appear in approved indexes;
5. no test uses a real deployment root, knowledge document, assistant identity, provider route, or secret.

Run:

```powershell
npm.cmd run test:unit
npm.cmd run check
```
