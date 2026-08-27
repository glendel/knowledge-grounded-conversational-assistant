# Human-facing documentation improvement loop

This directory is a deployment-owned workspace for documents made clearer, more complete, or more task-focused through the assistant's governed learning process.

```text
original human sources
-> approved Knowledge Base
-> real conversations and review findings
-> AI-assisted documentation draft
-> responsible human validation
-> published human documentation
-> source registration and normal Knowledge Base lifecycle
```

## Directories

- `drafts/` holds proposals. They may be based on approved evidence, interaction findings, and review feedback, but they are not official sources and are never runtime-retrievable.
- `published/` holds human-approved documents that people may use operationally. Publishing a document does not, by itself, make it Knowledge Base evidence.

## Required provenance

Every draft should have a review record that declares:

1. the original source identifiers and segments used;
2. the questions, gaps, corrections, or transcript findings that motivated it;
3. its explicit limits and unresolved items;
4. the responsible human reviewer and publication decision.

## Promotion rule

When a responsible human approves a published document as a source of operational truth, copy or register the approved immutable version under `app/knowledge/sources/`. It must then be extracted, reviewed, approved, indexed, evaluated, and released through the same governed lifecycle as every other source.

An assistant never silently turns a user correction, conversation, AI draft, or published file into factual knowledge.
