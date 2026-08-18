# Phase 4 — Self-Hosted Deployment Mode

## Objective

Make a normal clone independently configurable without changing or forking Core source:

```text
git clone <Core repository> <assistant directory>
```

The clone becomes one self-hosted deployment when an administrator creates its local `app/`, `config/`, `.env`, and `tmp/` material. The same Core still supports an external deployment root for organizations that require physical separation.

## Ownership model

Tracked Core content is generic and pullable: `src/`, `bin/`, `context/`, `docs/`, `tools/`, `app-template/`, and `config/templates/`.

Local deployment content is ignored: `app/`, live `config/*.json`, `.env`, and `tmp/`. `app/` holds durable deployment material; `tmp/` holds disposable scratch data only. It may name a real assistant, company, product, provider, model, or Knowledge Base, but it must never be staged or pushed to the Core repository.

## Safety model

- The administrator explicitly supplies the deployment root; the runtime never guesses it.
- A descriptor reports either `self_hosted` (Core root equals deployment root) or `external` (separate roots).
- Nested roots remain forbidden because they make ownership ambiguous.
- The Core boundary gate scans tracked Core content and fails when deployment paths, live configuration, or secrets are tracked. Ignored local deployment material is deliberately excluded from Core scanning.
- `git pull` changes only tracked Core files and templates. It never overwrites ignored local assistant data.

## Administrator workflow

1. Clone the Core into the intended assistant directory.
2. Run `node ./bin/initialize-self-hosted-deployment.js --deployment-root <absolute-clone-root>`.
3. Copy/adapt safe material under `app-template/` and `config/templates/` into ignored `app/` and `config/` files.
4. Add credentials only to ignored `.env` or the deployment environment.
5. Digest, review, approve, and index the Knowledge Base.
6. Qualify provider lanes and run conversation acceptance before exposing a channel.
7. Before a Core update: keep Core edits absent, then run `git pull`, dependency installation if required, `npm run check`, and deployment acceptance again.

## Non-goals

This mode does not make a clone multi-tenant, does not make deployment content public, and does not silently migrate a local configuration after a Core update. It preserves the one-clone, one-governed-assistant model.
