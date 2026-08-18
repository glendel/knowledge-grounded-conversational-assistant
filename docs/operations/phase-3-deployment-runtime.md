# Phase 3 Deployment Runtime

## Purpose

The Core runtime operates on one explicitly selected deployment root. It does not become a deployment by being copied beside one, and it never guesses which business data it should load.

The selected deployment root must contain:

- config, containing a complete Core-compatible configuration set;
- app, containing deployment-owned approved knowledge and evaluation material;
- environment-provided secrets when an enabled provider lane needs them.

The deployment may be external or self-hosted. In self-hosted mode, `app/`, local `config/*.json`, `.env`, and `tmp/` live in the clone but remain ignored and untracked. Durable deployment data belongs under `app/`; `tmp/` contains only disposable scratch material. In external mode, all deployment material remains outside the Core checkout. Never track provider credentials, logs, transcripts, raw sources, approved knowledge, or other deployment data in this repository.

See the [self-hosted deployment design](../architecture/phase-4-self-hosted-deployment-mode.md) for initialization and pull-safe update rules.

## Console probe

Use absolute paths:

    node --env-file-if-exists=<deployment-root>/.env ./bin/chat-cli.js ^
      --deployment-root <absolute-deployment-root> ^
      --conversation-id <opaque-conversation-id> ^
      --user-id <opaque-user-id> ^
      --message "Hello"

Omit the message option for an interactive console. The console does not write transcripts or scratch records by itself; use the dedicated evaluation and probe tools when temporary output is needed.

The console prints a typed technical failure to stderr when no qualified provider lane is available. It does not replace a failed model call with a canned assistant answer.

## Provider qualification records

Provider qualification records belong to the selected deployment at:

    app/evaluations/provider-qualification/

They are validated before a network lane can generate prose. The Core does not choose a model, route, credential, or qualification record.

## Deployment-owned acceptance dataset

Create an external JSON dataset with this shape:

    {
      "schemaVersion": 1,
      "id": "conversation-evaluation-v1",
      "scenarios": [
        {
          "id": "spanish-continuity",
          "conversationId": "evaluation-spanish-001",
          "userId": "evaluation-user-001",
          "turns": [
            {
              "id": "turn-001",
              "message": "Hola",
              "language": "es",
              "evidenceState": "no_evidence"
            }
          ]
        }
      ]
    }

Run it with:

    node --env-file-if-exists=<deployment-root>/.env ./tools/run-conversation-acceptance.js ^
      --deployment-root <absolute-deployment-root> ^
      --dataset <absolute-dataset-file>

The tool checks technical success, evidence state, and language fit without requiring exact assistant wording. Human review still decides whether the transcript is natural, grounded, and useful.

## Migration rule

A legacy deployment configuration is not automatically accepted. Remove or deliberately redesign obsolete fields that request extra answer-review loops, rigid reply schemas, deterministic reply templates, or runtime features not yet included in the selected Core release.

Validate a migration with the console before using a real user channel. A configuration error is a safe migration signal; it must not be bypassed through compatibility defaults.
