# Deployment pack template

This is a structural, synthetic template—not a runnable assistant and not a place for Core development data.

A deployment root owns:

- `app/knowledge/sources/` for private raw inputs;
- `app/knowledge/extracted/`, `drafts/`, `approved/`, `indexes/`, and `evaluations/` for its governed Knowledge Base lifecycle;
- `app/documentation/drafts/` for AI-assisted, human-reviewable documentation improvements and `app/documentation/published/` for human-approved documents used directly by people;
- `app/evaluations/` for its purpose-specific Golden Datasets and provider qualification evidence;
- `app/data/` for durable local memory, jobs, callbacks, and reviewable operational state.
- `tmp/` for disposable probes, temporary transcripts, logs, and scratch work.

Raw sources, approved knowledge, evaluation cases, runtime state, and secrets must never be copied into the Core repository. The Core will later validate this structure through an explicit deployment-root contract.

Human-facing documentation is not runtime evidence merely because it exists. A published document becomes retrieval-eligible only after it is registered as a source and completes the normal extraction, review, approval, indexing, and evaluation lifecycle.
