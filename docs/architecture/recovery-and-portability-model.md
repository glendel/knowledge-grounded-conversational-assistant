# Recovery and Portability Model

## Purpose

A self-hosted assistant deployment must be recoverable without copying Core source or operational scratch material.

```text
fresh Core clone + app/ + config/ + .env + dependency installation = restored assistant deployment
```

## Ownership and retention

| Location | Owner | Retention | Contents |
|---|---|---|---|
| `app/knowledge/` | Assistant creator | Durable | Raw inputs, governed Knowledge Base lifecycle, approved documents, indexes, and evaluations |
| `app/data/` | Assistant creator | Durable by configured policy | Chat memory, future gateway state, and reviewable improvement records |
| `config/` | Assistant creator | Durable | Assistant identity, provider routes, language, retention, and deployment policy |
| `.env` | Assistant creator | Durable secret material | Credentials and private environment values only |
| `tmp/` | Runtime and administrators | Disposable | Provider probes, temporary transcripts, logs, and scratch work |

`tmp/` may be deleted at any time. It must never contain the only copy of approved knowledge, assistant configuration, durable chat continuity, a queued operation, or a reviewable improvement record.

## Recovery procedure

1. Stop the deployment and make a verified private backup of `app/`, `config/`, and `.env`.
2. Create a fresh clone of the versioned Core repository.
3. Run `npm.cmd ci`.
4. Restore `app/`, `config/`, and `.env` into the clone root.
5. Run `npm.cmd run check` and a deployment-specific conversation probe.

Core folders such as `src/`, `bin/`, `context/`, `tests/`, and `docs/` are restored by Git. Do not copy them from an old deployment.

## Update procedure

Keep deployment material untracked. Before updating Core, preserve the local deployment pack, then run `git pull`, install dependencies if the lockfile changed, run Core checks, and re-run deployment acceptance. A Core pull must never overwrite ignored `app/`, `config/`, `.env`, or `tmp/` material.

## Legacy migration

Older clones may still contain `runtime-data/`. It is legacy disposable scratch material and is ignored for pull safety. Current Core commands do not use it. Verify that no local process is using it, then delete it; new clones create `tmp/` instead.
