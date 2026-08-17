# Phase 3 Closure Certificate

**Status:** closed

## Certified outcome

Phase 3 delivers a reusable, prose-first conversation runtime for one explicitly selected and independently governed deployment. It proves the first Core outcome required by the North Star: a model-led conversation can remain natural, fluent, useful, honest, and grounded in approved evidence without deterministic dialogue trees or required structured model replies.

## Closure evidence

- The explicit deployment descriptor rejects inferred, overlapping, malformed, and policy-weakened deployment roots.
- Runtime retrieval consumes approved records and validated indexes only. Raw sources, drafts, rejected material, stale records, logs, secrets, paths, and unrelated sessions remain outside model context.
- The runtime uses one ordinary prose-generation call per user turn. Deterministic code validates boundaries; it does not choose greetings, write answers, or replace failed generation with a canned reply.
- Real provider evaluation completed one coherent 20-turn Spanish scenario and one coherent 20-turn English scenario against an external, qualified deployment lane. All 40 turns met language and evidence-state expectations.
- Human transcript review covered greetings, follow-ups, corrections, topic changes, unsupported questions, uncertainty, and prompt-injection attempts. The reviewed run contained no user-visible JSON, internal request narration, internal path, redaction marker, or empty reply.
- The Core gate passed after closure hardening: boundary, lint, 46 unit tests, 7 integration tests, 4 contract tests, and 2 security tests.

## Hardening learned during certification

Certification improved reusable Core behavior without adding a conversation script:

- Actual user text, including ordinary Spanish morphology, determines language selection; untrusted channel language hints are not used.
- Approved knowledge may supply multilingual retrieval terms through deployment-owned metadata.
- Generic social terms are excluded from lexical retrieval so courtesy turns do not receive irrelevant evidence.
- The model receives an explicit fact-boundary instruction and a narrow output guard rejects obvious internal request narration before it reaches a user.

## Deliberate limitations

Phase 3 retains recent turns only in process. It does not provide durable memory, REST/callback transport, caller registration, channel adapters, automatic learning, tools, browsing, planning loops, or multi-agent orchestration. Those remain separate milestones and must preserve this certificate's North Star boundaries.

## Re-certification rule

A new deployment, provider lane, model, material prompt/context policy change, or Core conversation-boundary change requires appropriate repeat evaluation. A passing deterministic test suite alone never certifies conversational quality.
