# Phase 2.3 — Contract Foundation

## Objective

Make the Core's machine boundaries explicit, strict, versioned, and independently testable before provider, knowledge, or deployment runtime capabilities are introduced.

## Included

- The generic contract registry and its versioned required-contract inventory.
- Fifty strict JSON Schema contracts for configuration, knowledge lifecycle, provider capability, conversation, memory, gateway, evaluation, and observability boundaries.
- Synthetic fixtures that prove each contract accepts valid content and rejects unexpected fields.
- AJV 2020-12 validation with standard format validation.

The contracts define reusable shapes only. They do not configure a real assistant, contain real knowledge, select a provider or model, or create a deployment root.

## Invariants

- Every required contract declares JSON Schema Draft 2020-12, a stable versioned identifier, `schemaVersion`, an object type, and `additionalProperties: false`.
- The registry loads all required schemas into one validator so references and schema compatibility fail early.
- Contract fixtures are synthetic and must not contain a real assistant, business identity, source document, callback secret, or operational record.
- A runtime capability may be added only after it validates its inputs and outputs against the applicable Core contracts.

## Verification

```text
npm run test:contracts
npm run check
```

The next batch may use these contracts to define generic configuration and provider capability boundaries. It must still keep actual provider routes, models, credentials, caller registrations, and deployment files outside the Core repository.
