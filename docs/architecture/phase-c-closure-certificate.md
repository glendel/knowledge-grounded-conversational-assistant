# Phase C Closure Certificate — Probabilistic Conversation Acceptance

**Status:** Closed on 2026-08-18  
**Scope:** reusable Core only

## North Star decision

Phase C strengthens evidence about real conversations without turning the Core into a scripted chatbot. The model continues to own ordinary user-facing prose. The acceptance harness observes and protects the conversation; it does not select canned replies, require structured provider output, compare exact wording, or create dialogue branches.

## Delivered Core capability

- A deployment-root-explicit acceptance command for realistic, deployment-owned conversation datasets.
- Sanitized, atomic checkpoints after every completed turn under the deployment's disposable `tmp/conversation-acceptance/` directory.
- Resume protection through a dataset SHA-256 fingerprint and a stable opaque run identifier.
- An exclusive per-run lease. A second process cannot overwrite an active run; recovering a stale lease requires an explicit `--recover-lock` decision after the administrator confirms the prior process is no longer active.
- Recorded outcome evidence: actual provider lane, provider, model, attempt, typed technical failure if any, response language, evidence state, availability of sources, and deterministic review findings.
- Strictly bounded automatic assertions: language fit, expected evidence state, minimum reply length, and successful runtime completion. Naturalness, helpfulness, factual nuance, tone, and safe guidance remain reviewer judgments.
- Transcript redaction before persistence. Credentials, raw source material, hidden prompts, provider request bodies, and unredacted sensitive candidates are excluded.

## Verification evidence

The generic implementation passed Core boundary, lint, unit, integration, contract, and security checks. Unit coverage proves checkpoint/resume, redaction, deployment path confinement, dataset identity protection, active-run refusal, and deliberate stale-lease recovery.

Two independently configured deployments then completed realistic twenty-turn live conversations in every language each deployment declares as supported:

- the first deployment: one Spanish scenario and one English scenario;
- the second deployment: one English scenario and one Spanish scenario.

All four runs completed with no automatic blockers. Cross-language testing exposed a generic classifier weakness: an ordinary English message with none of the previous narrow English markers could fall back to the configured first language. The Core was hardened with broader business-neutral English and Spanish signals, direct unit coverage, and a fresh successful twenty-turn rerun. The persisted records showed natural provider-generated prose, correct requested-language outcomes, evidence/no-evidence distinctions, and observable primary/fallback provider-lane behavior. The records, datasets, identities, knowledge, and transcripts remain ignored deployment material and were not added to the Core.

## Honest limits

This certificate closes the reusable Phase C capability. It does not silently approve a deployment's Knowledge Base, claims, policy, provider qualification, human-facing quality, or production readiness. A completed artifact deliberately remains `human_review_required` until the responsible deployment administrator reviews it. Every deployment must supply and review its own evaluation dataset before its own human or production release.

## Next phase

Phase D is the generic REST and callback gateway: a secured dumb-terminal boundary with caller validation, asynchronous callback delivery, retries, and deployment-owned operational records.
