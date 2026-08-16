# Core Extraction Checklist

## Before copying a candidate

- [ ] Classify the source file as a genuine generic capability.
- [ ] Remove business identities, product terms, documents, URLs, secrets, and operational references.
- [ ] Replace examples and fixtures with synthetic neutral data.
- [ ] Confirm the file does not reach a deployment pack by implicit checkout-relative paths.
- [ ] Add or update generic tests.
- [ ] Run the Core boundary check.
- [ ] Review the staged diff for data contamination.

## Before a Core release

- [ ] Run boundary, formatting, lint, contract, unit, integration, security, and multi-deployment checks.
- [ ] Scan staged content for credentials and real deployment material.
- [ ] Confirm no raw source, approved Knowledge Base, transcript, log, memory, or provider qualification record is tracked.
- [ ] Record compatibility and rollback guidance.
