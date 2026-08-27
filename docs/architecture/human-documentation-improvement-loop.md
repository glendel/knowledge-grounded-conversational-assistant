# Human Documentation Improvement Loop

## Purpose

The Core supports a deployment workflow in which better assistant conversations and better human documentation reinforce each other. The product outcome is not limited to a stronger assistant: responsible people also receive clearer, task-focused documentation they can use without the assistant.

The workflow applies to every assistant purpose. A support deployment may create operating guides; a seller deployment may create a reviewed product guide; an internal-knowledge deployment may create a clearer policy explainer. The Core contains none of those real documents.

## Model

```text
existing human source material
-> governed Knowledge Base
-> model-led, evidence-grounded conversations
-> reviewable learning signals
-> AI-assisted documentation candidates
-> human validation and publication
-> newly registered human sources
-> next governed Knowledge Base release
```

The loop is a documentation-improvement loop, not autonomous self-training. Deterministic Core behavior preserves provenance, approval, isolation, and evaluation boundaries; the configured model helps understand patterns, organize evidence, and write a useful draft.

## Learning signals

A deployment may use these as inputs to a candidate document:

- recurring requests for the same process or form field;
- grounded answers that repeatedly need more detail;
- user corrections or directly supplied operational facts;
- a safe handoff caused by an approved-knowledge gap;
- transcript evaluation findings;
- administrator reviews of ambiguity, obsolete wording, or weak source organization.

Signals describe a candidate for investigation. They do not prove a fact and are not eligible for user-turn retrieval.

## Artifact states

| State | Intended audience | Runtime eligibility |
|---|---|---|
| Original source | Administrators and reviewers | No, until governed processing completes |
| Documentation draft | Administrators and responsible reviewers | No |
| Published human document | People in the deployment | No, by publication alone |
| Registered and approved Knowledge Base record | Runtime and people | Yes, after validation, indexing, and evaluation |

Each documentation draft carries a provenance/review record. It identifies the original evidence, relevant conversation or review finding, open questions, and required human validation.

## Human validation

The responsible human team decides whether a draft is accurate, complete, useful, current for the deployed product version, and appropriate for the intended audience. They may edit it, attach approved screenshots/examples, reject it, or request another draft.

After approval, the immutable published version can become a new source. It then enters the normal source discovery, extraction, curation, approval, index, and evaluation process. This second gate prevents a polished document from bypassing evidence governance.

## Core and deployment boundary

Core supplies generic documentation templates and this process. The deployment owns all actual manuals, conversation findings, identities, screenshots, published guides, source records, and Knowledge Base releases. No deployment-specific documentation is committed to the Core repository.

## Quality indicators

A deployment can measure the loop using reviewable signals rather than scripted dialogue outcomes:

- recurrence of a documented question before and after publication;
- retrieval success for the associated evaluation cases;
- human ratings of clarity, depth, and correctness;
- reduction in avoidable handoffs or clarification loops;
- explicit version and reviewer coverage for published documentation.

These indicators guide prioritization; they must never silently promote a draft or override a responsible human review.
