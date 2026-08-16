# Deployment pack template

This is a structural, synthetic template—not a runnable assistant and not a place for Core development data.

A deployment root owns:

- `app/knowledge/sources/` for private raw inputs;
- `app/knowledge/extracted/`, `drafts/`, `approved/`, `indexes/`, and `evaluations/` for its governed Knowledge Base lifecycle;
- `app/evaluations/` for its purpose-specific Golden Datasets and provider qualification evidence;
- `runtime-data/` for memory, jobs, callbacks, logs, and other non-versioned operational state.

Raw sources, approved knowledge, evaluation cases, runtime state, and secrets must never be copied into the Core repository. The Core will later validate this structure through an explicit deployment-root contract.
