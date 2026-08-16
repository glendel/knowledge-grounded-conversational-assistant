# Core Repository Charter

## Objective

Maintain a reusable Core that lets independently governed deployments create natural, fluent, knowledge-grounded conversational assistants without copying business logic into generic source code.

## Ownership model

```text
Core repository
  generic runtime, adapters, contracts, templates, tests, documentation

Deployment root
  identity, purpose, configuration, policies, knowledge, evaluations, secrets, runtime state
```

The Core is versioned and reusable. A deployment adopts a Core version deliberately after its own validation. The Core never discovers or falls back to an arbitrary deployment directory.

## Promotion standard

Promote a change from a deployment only when it is:

1. useful beyond one business or assistant purpose;
2. free of business data, identity, credentials, and operational records;
3. expressed as a generic capability, contract, template, or test;
4. covered by a generic regression test; and
5. proven not to weaken deployment isolation or grounded conversation.

## Non-goals

The Core does not host shared tenants, synchronize deployment data, certify a deployment's knowledge accuracy, or make raw sources available at runtime.
