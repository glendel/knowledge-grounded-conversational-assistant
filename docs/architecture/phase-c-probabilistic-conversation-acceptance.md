# Phase C — Probabilistic Conversation Acceptance

## Objective

Make the North Star measurable through real, model-led conversations without converting it into an exact-answer or dialogue-tree test suite.

Phase C adds a reusable acceptance harness. It runs a deployment-owned scenario dataset against the configured runtime, stores a sanitized and resumable transcript in `tmp/`, captures safe provider-route evidence, and produces deterministic constraint findings for Human Administrator review.

## Boundaries

The harness is not a second conversation engine. It calls the same conversation runtime used by the assistant. It never asks a provider for JSON, scores prose by matching canned answers, alters prompts to obtain a preferred result, or changes Knowledge Base content.

`app/evaluations/` owns durable acceptance scenarios. `tmp/conversation-acceptance/` owns disposable generated transcripts. A successful automated run means the declared constraints held; it always remains `human_review_required` before a release decision.

## Dataset model

Each deployment supplies its own ignored JSON dataset under `app/evaluations/`:

```json
{
  "schemaVersion": 1,
  "id": "spanish-support-conversation-v1",
  "scenarios": [
    {
      "id": "natural-continuity",
      "conversationId": "acceptance-es-001",
      "userId": "acceptance-user-001",
      "turns": [
        {
          "id": "turn-001",
          "message": "Hola, ¿me puedes ayudar?",
          "expect": { "language": "es", "evidenceState": "no_evidence", "minimumReplyCharacters": 20 }
        }
      ]
    }
  ]
}
```

Expectations may assert only safe, outcome-level properties: inferred language, evidence state, and a minimum non-empty response size. They may not contain expected assistant wording, keyword lists, prescribed steps, or model instructions.

## Run and resume

```powershell
node --env-file-if-exists=.env ./tools/run-conversation-acceptance.js `
  --deployment-root <absolute-clone-root> `
  --dataset <absolute-clone-root>/app/evaluations/<dataset>.json `
  --tmp-dir <absolute-clone-root>/tmp `
  --run-id <stable-run-id>
```

The harness writes after every completed turn. If a provider is slow or a process is interrupted, resume the same dataset safely with `--resume` and the same run ID. The dataset fingerprint must match when resuming. Transcript text is redacted before storage; provider request bodies, hidden prompts, credentials, raw source text, and unredacted sensitive candidates are never stored.

## Required Phase C evidence

Before a deployment is accepted for human testing, review at least one coherent twenty-turn Spanish scenario and one coherent twenty-turn English scenario. The combined set must cover normal greetings, follow-ups, correction, topic change, grounded guidance, uncertainty, and a safe unsupported request. Review selected provider lane/fallback evidence, retrieval state, language fit, transcript findings, and naturalness. A blocker is fixed in Core only when the fix is generic; never patch a model response through a deterministic tree.

## Definition of done

Phase C is closed when the generic Core harness is bounded by strict input validation, tests resumability and transcript redaction, records provider/evidence/language information, and has been live-run and human-reviewed in two independently configured deployment clones.
