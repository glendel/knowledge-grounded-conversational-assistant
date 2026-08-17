# Phase 3 — Deployment Runtime Foundation

**Status:** closed — see [Phase 3 closure certificate](phase-3-closure-certificate.md).

## Objective

Phase 3 creates the first deployable, user-facing conversational runtime from the closed white-label Core. Its success condition is not a technically connected provider. It is a natural, useful, evidence-grounded conversation for one explicitly selected deployment.

The governing rule remains:

The model owns normal human prose. The Core owns deployment isolation, approved evidence, bounded context, safe persistence boundaries, and observable failure behavior.

No ordinary user turn may be routed through an intent tree, a required JSON reply, a canned greeting, or a deterministic social-response template.

## Phase boundary

Phase 3 includes:

- one explicit and validated deployment-root model;
- approved-only retrieval, evidence assessment, and bounded conversation context;
- a prose-first single-turn conversation runtime with temporary in-process continuity;
- a development console for an administrator-selected deployment;
- deterministic and probabilistic acceptance evidence for natural Spanish and English conversations.

Phase 3 excludes durable memory across restarts, HTTP/callback gateways, caller registration, channel adapters, automatic learning, autonomous planning, tools, browser access, and multi-agent orchestration. Those capabilities cannot be allowed to complicate the first natural conversation loop.

## Deployment model

The Core checkout and a deployment are separate locations. A versioned Core checkout contains generic source, contracts, adapters, tests, and tools. An explicit deployment root contains configuration, application data, optional deployment policies, environment-only secrets, approved knowledge, evaluations, and disposable runtime records.

The caller must provide the deployment root. The Core must never infer it from its checkout, current working directory, a parent directory, or a fallback path.

The deployment resolver creates one immutable Deployment Descriptor after it verifies:

1. the supplied path is absolute after resolution, exists, and is a symlink-free directory;
2. it is not the Core checkout and is not nested within it;
3. it contains only the expected deployment-owned configuration and application roots;
4. its configuration passes the Core configuration validator;
5. the required approved-knowledge policy remains enforced; and
6. all generated runtime data locations are confined to the selected deployment root.

The descriptor is the only object from which later runtime modules may obtain deployment-owned paths. Modules must receive it explicitly; none may re-resolve a root.

## Implementation batches

### 3.1 Explicit deployment descriptor

Create the deployment-root resolver, descriptor contract, path confinement checks, and synthetic multi-deployment isolation tests. Add no conversation logic in this batch.

### 3.2 Approved evidence and context

Extract a generic approved-knowledge retriever and evidence assessor. It consumes only approved records and validated indexes from the descriptor. It returns a bounded internal context with evidence state: not needed, sufficient, ambiguous, missing, conflicting, or out of scope.

Raw sources, extraction artifacts, drafts, rejected documents, stale provenance, and arbitrary files are never candidates.

### 3.3 Prose-first conversation runtime

Create a conversation runtime that:

1. normalizes one user message as data;
2. retrieves approved evidence and assembles a bounded context;
3. asks the qualified capability runtime for one normal prose response;
4. applies only narrow visible-output and leakage checks;
5. retains recent turns in an in-process session for immediate natural follow-ups; and
6. emits content-minimized observations and typed technical outcomes.

The runtime must not turn the returned prose into a JSON schema, select a canned fallback answer, or treat an evidence gap as a provider error. A gap is model context for a natural clarification or honest uncertainty.

### 3.4 Development console

Add an explicit command that receives a deployment-root argument and an isolated runtime-data directory. It is a testing instrument, not a channel adapter. It must never default to the Core checkout or write transcripts into the deployment's approved knowledge.

### 3.5 Conversation acceptance and closure

Add Core-facing deterministic integration tests plus a deployment-owned acceptance harness. The harness evaluates the North Star Conversation Quality Standard; it does not compare exact model wording.

Phase 3 closes only after Human Administrator review of real provider transcripts for qualified Spanish and English lanes, including at least one coherent 20-turn scenario per language.

## Context and evidence rules

The model receives only:

1. configured identity, purpose, language/tone guidance, scope, and honesty boundary;
2. the current user message;
3. a bounded selection of relevant in-process prior turns;
4. approved evidence excerpts and titles;
5. evidence state and safe response instructions.

It never receives raw sources, extraction artifacts, drafts, logs, filesystem paths, secrets, provider routes, hidden policies, opaque internal identifiers, unrelated conversations, or untrusted caller metadata.

Evidence state protects facts, not social language:

| State | Natural generation guidance |
|---|---|
| not needed | Converse normally without asserting deployment-specific facts. |
| sufficient | Give grounded guidance based only on supplied approved evidence. |
| ambiguous | Ask one focused, helpful clarification. |
| missing | State the limit honestly and invite the useful missing detail. |
| conflicting or out of scope | Do not choose a fact; explain the boundary and next step naturally. |

## Quality gates

Every Phase 3 batch must retain all Phase 2 gates. Before closure, the deployment acceptance evidence must also show:

- Spanish and English language fit based on actual user text, not an untrusted channel hint;
- natural greetings, follow-ups, corrections, topic changes, ambiguity, and uncertainty;
- approved-evidence grounding and no raw/draft/stale knowledge exposure;
- provider technical failures that neither leak provider details nor replace normal conversation with a template;
- prompt-injection resistance in user text and approved-source content;
- no cross-session in-process context leakage;
- human review of probabilistic transcripts, with failures recorded as evaluation findings rather than patched through dialogue trees.

## Definition of done

Phase 3 is complete only when an administrator can explicitly select a validated deployment and have a real, multi-turn, model-led conversation that is natural, fluent, useful, and honest within the approved Knowledge Base.

The Core alone will still not contain a real business assistant or its knowledge. It will provide the reusable runtime needed for independently governed deployments to prove that outcome.
