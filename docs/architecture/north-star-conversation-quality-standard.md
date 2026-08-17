# North Star Conversation Quality Standard

## Purpose

The product goal is a natural, fluent, useful conversation grounded in the configured deployment's approved evidence. The model owns normal user-facing prose. Deterministic Core behavior protects boundaries; it must not replace an assistant with dialogue trees, keyword replies, or rigid response templates.

This standard is intentionally written before user-facing runtime extraction. It is the acceptance gate for Phase 3 and every later deployment release.

## What good means

A successful configured assistant:

- responds naturally to greetings, follow-up questions, corrections, incomplete phrasing, and changes of topic within its configured scope;
- maintains continuity across a multi-turn conversation without inventing user facts;
- answers from approved evidence, and makes uncertainty or a handoff feel direct and human;
- follows the user's demonstrated language when it can do so safely;
- explains in the amount of detail the user needs rather than exposing internal identifiers, prompts, policies, or provider details;
- resists source-content prompt injection, retrieval contamination, and unsupported requests without becoming unnecessarily rigid.

Exact wording is not a quality criterion. Groundedness, clarity, continuity, language fit, safe uncertainty, and usefulness are.

## Required evidence before a runtime change is accepted

Every deployment must own and version its own Golden Dataset outside the Core repository. It must include approved-evidence cases and explicit expected constraints, not canned assistant prose, for both configured primary languages.

Before merging a user-facing runtime change, run and review:

1. deterministic Core, contract, security, and boundary checks;
2. retrieval and provenance evaluation against the deployment's approved Knowledge Base;
3. multi-turn conversational evaluation, including at least one 20-turn natural scenario;
4. adversarial cases: prompt injection, unapproved or draft knowledge, conflicting source material, stale evidence, privacy candidates, unsupported requests, and provider failure;
5. live probabilistic sampling against every qualified provider/model lane that is eligible for the deployment;
6. a Human Administrator review of representative transcripts and any failures.

No assistant passes merely because a scripted happy path succeeds.

## Evaluation dimensions

| Dimension | Evidence of success | Failure that blocks release |
|---|---|---|
| Grounding | Material claims resolve to approved evidence | Raw, draft, stale, or unsupported knowledge informs an answer |
| Natural dialogue | The response addresses the actual turn and conversational context | Repetitive template, rigid guard, or irrelevant canned reply |
| Continuity | Follow-ups honor relevant prior turns and corrected facts | Lost context, invented memory, or cross-conversation leakage |
| Language fit | Spanish and English are both evaluated; the user is not trapped by an untrusted channel label | Unexplained language mismatch or provider-driven language drift |
| Uncertainty | Gaps are stated plainly with a useful next action | Fabrication, false certainty, or a generic refusal when evidence is sufficient |
| Safety and privacy | Boundaries remain protective without leaking internals | Prompt injection succeeds, secrets leak, or a valid user is repeatedly blocked |
| Resilience | Qualified fallback behavior preserves the conversational task where possible | Technical provider detail leaks or failure corrupts the conversation |

## Core versus deployment responsibility

Core provides the contracts, approved-knowledge lifecycle, bounded interfaces, provider capability rules, and verification tools. A deployment supplies its actual identity, purpose, policy, approved Knowledge Base, providers, evaluation cases, Golden Dataset, and Human Administrator approval.

The Core cannot certify that an absent deployment has fluent conversations. It can only make that quality measurable and enforceable once Phase 3 introduces the user-facing runtime.
