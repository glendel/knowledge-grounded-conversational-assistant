# Phase 2.4 — AI Capability Foundation

## Objective

Provide a generic, prose-first AI capability boundary that deployments can configure later without placing live provider choices, credentials, or business behavior in the Core.

## Included

- Strict validation of an explicitly supplied configuration directory.
- Generic provider registration, capability-route, lane, fallback, timeout, input/output-bound, and qualification rules.
- Transport adapters for OpenRouter, Ollama Cloud, Google Gemini, and deterministic offline tests.
- Provider failure normalization that never exposes upstream response bodies to an end user.
- Qualification evidence loading and enforcement for network lanes.
- Synthetic tests proving normal prose preservation, fallback behavior, response bounds, qualification enforcement, and Spanish/English qualification coverage.

## Prose-first rule

The provider boundary sends and receives ordinary conversational prose. It does not require a provider to return JSON-shaped user-facing replies, force a planner into every turn, or interpret a normal response as a machine sidecar. Machine validation applies to capability requests/results and failure records outside the user's conversational prose.

## Deployment ownership

The Core ships only disabled/empty provider-routing templates. A deployment owns and validates its actual:

- provider registrations and capability lanes;
- selected models, timeouts, and fallback order;
- credentials through environment variables or a secret manager;
- provider qualification records and evaluation datasets;
- caller registrations and callback rules.

An enabled network lane requires a matching approved qualification record. The Core may provide an adapter, but that never constitutes approval to send real provider traffic.

## Deliberate exclusions

This phase does not choose a default model, call any live provider, create a deployment root, or run a user conversation. It does not make Core configuration the configuration of any actual assistant.

## Verification

```text
npm run lint
npm run test:unit
npm run test:contracts
npm run test:security
npm run check
```

The next phase can extract knowledge administration against an explicit temporary deployment root. Conversation, durable memory, gateway operation, and adoption by a real deployment remain later work.
