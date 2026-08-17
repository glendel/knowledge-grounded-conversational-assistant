# Phase 3 Deployment Runtime

## Purpose

The Core runtime operates on one explicitly selected deployment root. It does not become a deployment by being copied beside one, and it never guesses which business data it should load.

The selected deployment root must contain:

- config, containing a complete Core-compatible configuration set;
- app, containing deployment-owned approved knowledge and evaluation material;
- environment-provided secrets when an enabled provider lane needs them.

The Core checkout must remain separate. Do not place a deployment app directory, live configuration, provider credentials, logs, transcript, or raw sources in this repository.

## Console probe

Use absolute paths:

    node --env-file-if-exists=<deployment-root>/.env ./bin/chat-cli.js ^
      --deployment-root <absolute-deployment-root> ^
      --runtime-data-dir <absolute-disposable-runtime-directory> ^
      --conversation-id <opaque-conversation-id> ^
      --user-id <opaque-user-id> ^
      --message "Hello"

Omit the message option for an interactive console. The runtime-data directory is intentionally explicit so later runtime records cannot silently appear in approved knowledge or the Core checkout.

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
