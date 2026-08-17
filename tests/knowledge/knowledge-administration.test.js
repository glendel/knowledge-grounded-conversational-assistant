import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadCoreConfiguration } from '../../src/config/core-configuration.js';
import { loadContractRegistry } from '../../src/contracts/contract-registry.js';
import { analyzeSource, approveDraft, buildIndexes, classifySource, createDraft, createKnowledgeAdministration, evaluateKnowledgeBase, extractSource, rejectDraft, reviewKnowledgeBase, scanSources, validateKnowledgeBase } from '../../src/knowledge/knowledge-administration.js';
import { writeSyntheticCoreConfiguration } from '../fixtures/core-configuration.js';

const CORE_ROOT = path.resolve(import.meta.dirname, '..', '..');

async function createService(deploymentRoot, now = () => '2026-08-01T00:00:00.000Z') {
  const configuration = await loadCoreConfiguration({ configDirectory: path.join(deploymentRoot, 'config') });
  const contracts = await loadContractRegistry({ contractsDirectory: path.join(deploymentRoot, 'context', 'contracts') });
  return createKnowledgeAdministration({ deploymentRoot, configuration, contracts, now });
}

async function fixtureProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'knowledge-admin-'));
  await writeSyntheticCoreConfiguration(path.join(root, 'config'));
  await cp(path.join(CORE_ROOT, 'context'), path.join(root, 'context'), { recursive: true });
  await mkdir(path.join(root, 'app', 'knowledge', 'sources'), { recursive: true });
  await writeFile(path.join(root, 'app', 'knowledge', 'sources', 'safe-guide.txt'), 'Set up the product from the approved guide. Contact jane@example.com only in this synthetic test.', 'utf8');
  return root;
}

async function prepareDraft(root) {
  const service = await createService(root);
  const scan = await scanSources(service);
  const sourceId = scan.data.activeSourceIds[0];
  await classifySource(service, { sourceId, authority: 'authoritative', storageClassification: 'local_only' });
  await extractSource(service, { sourceId });
  await createDraft(service, { sourceId, documentId: 'knowledge_safe-guide', title: 'Safe Guide', language: 'en', aiAdministrator: 'ai-administrator' });
  return { service, sourceId };
}

test('requires an explicit deployment root and injected validated dependencies', async () => {
  await assert.rejects(
    () => createKnowledgeAdministration(),
    (error) => error?.code === 'KNOWLEDGE_DEPLOYMENT_ROOT_REQUIRED'
  );

  const root = await fixtureProject();
  try {
    await assert.rejects(
      () => createKnowledgeAdministration({ deploymentRoot: root }),
      (error) => error?.code === 'KNOWLEDGE_CONFIGURATION_REQUIRED'
    );
    const configuration = await loadCoreConfiguration({ configDirectory: path.join(root, 'config') });
    await assert.rejects(
      () => createKnowledgeAdministration({ deploymentRoot: root, configuration }),
      (error) => error?.code === 'KNOWLEDGE_CONTRACTS_REQUIRED'
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('runs the governed lifecycle and indexes only explicitly approved knowledge', async () => {
  const root = await fixtureProject();
  try {
    const { service, sourceId } = await prepareDraft(root);
    const artifact = JSON.parse(await readFile(path.join(root, 'app', 'knowledge', 'extracted', sourceId, (JSON.parse(await readFile(path.join(root, 'app', 'knowledge', 'registry.json'), 'utf8'))).sources[sourceId].sourceContentSha256, 'artifact.json'), 'utf8'));
    assert.match(artifact.segments[0].text, /REDACTED_EMAIL/);
    assert.deepEqual(artifact.redactionSummary.byKind, { email: 1 });
    assert.deepEqual(artifact.segments[0].redactionKinds, { email: 1 });
    const recordPath = path.join(root, 'app', 'knowledge', 'drafts', 'knowledge_safe-guide', 'record.json');
    const record = JSON.parse(await readFile(recordPath, 'utf8'));
    record.tags = ['setup']; record.topics = ['configuration']; record.retrievalTerms = ['setup', 'configure', 'configurar']; record.claims[0].text = 'Use the approved guide to set up the product.';
    record.review = { ...record.review, privacyReviewed: true, freshnessReviewed: true, authorityReviewed: true };
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    await writeFile(path.join(root, 'app', 'knowledge', 'drafts', 'knowledge_safe-guide', 'document.md'), '# Safe Guide\n\nUse the approved guide to set up the product.\n', 'utf8');
    const validation = await validateKnowledgeBase(service);
    assert.equal(validation.data.errorCount, 0);
    await assert.rejects(() => approveDraft(service, { documentId: 'knowledge_safe-guide', approvedBy: 'human-admin', declaration: 'missing' }), /HUMAN_APPROVAL_CONFIRMED/);
    await approveDraft(service, { documentId: 'knowledge_safe-guide', approvedBy: 'human-admin', declaration: 'HUMAN_APPROVAL_CONFIRMED' });
    const index = await buildIndexes(service);
    assert.equal(index.data.documentCount, 1);
    const manifest = JSON.parse(await readFile(path.join(root, 'app', 'knowledge', 'indexes', 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest.documentIds, ['knowledge_safe-guide']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('provides AI-administrator analysis and review evidence without silent approval', async () => {
  const root = await fixtureProject();
  try {
    const { service, sourceId } = await prepareDraft(root);
    const analysis = await analyzeSource(service, { sourceId, aiAdministrator: 'synthetic-ai-administrator' });
    assert.equal(analysis.data.briefing.approvalRequested, false);
    assert.ok(analysis.data.topTerms.some((term) => term.term === 'guide'));

    const review = await reviewKnowledgeBase(service, { aiAdministrator: 'synthetic-ai-administrator' });
    assert.deepEqual(review.data.briefing.proposedDocumentIds, ['knowledge_safe-guide']);
    assert.equal(review.data.briefing.approvalRequested, false);
    await assert.rejects(
      () => approveDraft(service, { documentId: 'knowledge_safe-guide', approvedBy: 'human-admin', declaration: 'HUMAN_APPROVAL_CONFIRMED' }),
      /curation/
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('does not allow an unfinished draft into approval or an approved index', async () => {
  const root = await fixtureProject();
  try {
    const { service } = await prepareDraft(root);
    await assert.rejects(() => approveDraft(service, { documentId: 'knowledge_safe-guide', approvedBy: 'human-admin', declaration: 'HUMAN_APPROVAL_CONFIRMED' }), /curation/);
    const index = await buildIndexes(service);
    assert.equal(index.data.documentCount, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('records a rejection without making rejected knowledge indexable', async () => {
  const root = await fixtureProject();
  try {
    const { service } = await prepareDraft(root);
    await rejectDraft(service, { documentId: 'knowledge_safe-guide', rejectedBy: 'human-admin', reason: 'Synthetic review rejected this draft.' });
    const record = JSON.parse(await readFile(path.join(root, 'app', 'knowledge', 'drafts', 'knowledge_safe-guide', 'record.json'), 'utf8'));
    assert.equal(record.status, 'rejected');
    assert.equal((await buildIndexes(service)).data.documentCount, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('fails closed for malformed JSON and unsupported source formats', async () => {
  const root = await fixtureProject();
  try {
    await writeFile(path.join(root, 'app', 'knowledge', 'sources', 'bad.json'), '{not valid json', 'utf8');
    await writeFile(path.join(root, 'app', 'knowledge', 'sources', 'unknown.bin'), 'not supported', 'utf8');
    const service = await createService(root);
    const scan = await scanSources(service);
    const registry = JSON.parse(await readFile(path.join(root, 'app', 'knowledge', 'registry.json'), 'utf8'));
    const badJson = scan.data.activeSourceIds.find((id) => registry.sources[id].relativePath === 'bad.json');
    const unsupported = scan.data.activeSourceIds.find((id) => registry.sources[id].relativePath === 'unknown.bin');
    await assert.rejects(() => extractSource(service, { sourceId: badJson }), /Strict JSON could not be parsed/);
    await assert.rejects(() => extractSource(service, { sourceId: unsupported }), /no approved extractor/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('enforces configured source-size limits before hashing or extraction', async () => {
  const root = await fixtureProject();
  try {
    const configPath = path.join(root, 'config', 'knowledge-administration.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    config.maxSourceFileBytes = 1024;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await writeFile(path.join(root, 'app', 'knowledge', 'sources', 'oversized.txt'), 'x'.repeat(2048), 'utf8');
    const service = await createService(root);
    await assert.rejects(() => scanSources(service), /permitted size limit/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('rejects a claim whose evidence segment was tampered after drafting', async () => {
  const root = await fixtureProject();
  try {
    const { service } = await prepareDraft(root);
    const recordPath = path.join(root, 'app', 'knowledge', 'drafts', 'knowledge_safe-guide', 'record.json');
    const record = JSON.parse(await readFile(recordPath, 'utf8'));
    record.tags = ['setup']; record.topics = ['configuration']; record.retrievalTerms = ['setup', 'configure', 'configurar']; record.claims[0].text = 'Use the approved guide to set up the product.';
    record.claims[0].evidenceRefs[0].segmentIds = [`segment_${'d'.repeat(32)}`];
    record.review = { ...record.review, privacyReviewed: true, freshnessReviewed: true, authorityReviewed: true };
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    await writeFile(path.join(root, 'app', 'knowledge', 'drafts', 'knowledge_safe-guide', 'document.md'), '# Safe Guide\n\nUse the approved guide to set up the product.\n', 'utf8');
    const validation = await validateKnowledgeBase(service);
    assert.ok(validation.data.errors.some((error) => error.code === 'KNOWLEDGE_CLAIM_EVIDENCE_SEGMENT_MISSING'));
    await assert.rejects(() => approveDraft(service, { documentId: 'knowledge_safe-guide', approvedBy: 'human-admin', declaration: 'HUMAN_APPROVAL_CONFIRMED' }), /blocking validation errors/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('keeps an invalid unapproved draft out of an approved-index rebuild', async () => {
  const root = await fixtureProject();
  try {
    const { service, sourceId } = await prepareDraft(root);
    const recordPath = path.join(root, 'app', 'knowledge', 'drafts', 'knowledge_safe-guide', 'record.json');
    const record = JSON.parse(await readFile(recordPath, 'utf8'));
    record.tags = ['setup']; record.topics = ['configuration']; record.retrievalTerms = ['setup', 'configure', 'configurar']; record.claims[0].text = 'Use the approved guide to set up the product.';
    record.review = { ...record.review, privacyReviewed: true, freshnessReviewed: true, authorityReviewed: true };
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    await writeFile(path.join(root, 'app', 'knowledge', 'drafts', 'knowledge_safe-guide', 'document.md'), '# Safe Guide\n\nUse the approved guide to set up the product.\n', 'utf8');
    await approveDraft(service, { documentId: 'knowledge_safe-guide', approvedBy: 'human-admin', declaration: 'HUMAN_APPROVAL_CONFIRMED' });
    await createDraft(service, { sourceId, documentId: 'knowledge_untrusted-draft', title: 'Untrusted Draft', language: 'en', aiAdministrator: 'ai-administrator' });
    await writeFile(path.join(root, 'app', 'knowledge', 'drafts', 'knowledge_untrusted-draft', 'document.md'), '# Untrusted Draft\n\nContact leak@example.com.\n', 'utf8');
    const fullValidation = await validateKnowledgeBase(service);
    assert.ok(fullValidation.data.errors.some((error) => error.documentId === 'knowledge_untrusted-draft' && error.code === 'KNOWLEDGE_DOCUMENT_SENSITIVE_CONTENT'));
    const index = await buildIndexes(service);
    assert.equal(index.data.documentCount, 1);
    const manifest = JSON.parse(await readFile(path.join(root, 'app', 'knowledge', 'indexes', 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest.documentIds, ['knowledge_safe-guide']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('indexes approved factual claims only and proves bilingual retrieval coverage', async () => {
  const root = await fixtureProject();
  try {
    const { service } = await prepareDraft(root);
    const recordPath = path.join(root, 'app', 'knowledge', 'drafts', 'knowledge_safe-guide', 'record.json');
    const record = JSON.parse(await readFile(recordPath, 'utf8'));
    record.tags = ['setup'];
    record.topics = ['configuration'];
    record.retrievalTerms = ['configure', 'configurar'];
    record.claims[0].text = 'Use the approved guide to set up the product.';
    record.review = { ...record.review, privacyReviewed: true, freshnessReviewed: true, authorityReviewed: true };
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    await writeFile(path.join(root, 'app', 'knowledge', 'drafts', 'knowledge_safe-guide', 'document.md'), '# Safe Guide\n\nUse the approved guide to set up the product.\n\nUnreviewed operational prose must never become a runtime fact.\n', 'utf8');
    await approveDraft(service, { documentId: 'knowledge_safe-guide', approvedBy: 'human-admin', declaration: 'HUMAN_APPROVAL_CONFIRMED' });
    await buildIndexes(service);
    const lexical = JSON.parse(await readFile(path.join(root, 'app', 'knowledge', 'indexes', 'lexical-index.json'), 'utf8'));
    assert.deepEqual(lexical.terms.configure, ['knowledge_safe-guide']);
    assert.equal(Object.hasOwn(lexical.terms, 'unreviewed'), false);
    await mkdir(path.join(root, 'app', 'knowledge', 'evaluations'), { recursive: true });
    await writeFile(path.join(root, 'app', 'knowledge', 'evaluations', 'retrieval.json'), JSON.stringify([
      { schemaVersion: 1, id: 'evaluation_en_setup', language: 'en', category: 'supported', input: 'How do I configure the product?', expectedOutcome: 'answer', expectedKnowledgeIds: ['knowledge_safe-guide'] },
      { schemaVersion: 1, id: 'evaluation_es_setup', language: 'es', category: 'supported', input: '¿Cómo puedo configurar el producto?', expectedOutcome: 'answer', expectedKnowledgeIds: ['knowledge_safe-guide'] }
    ], null, 2), 'utf8');
    const evaluation = await evaluateKnowledgeBase(service);
    assert.equal(evaluation.data.valid, true);
    assert.equal(evaluation.data.caseCount, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('marks approved knowledge stale when its authoritative source changes', async () => {
  const root = await fixtureProject();
  try {
    const { service } = await prepareDraft(root);
    const recordPath = path.join(root, 'app', 'knowledge', 'drafts', 'knowledge_safe-guide', 'record.json');
    const record = JSON.parse(await readFile(recordPath, 'utf8'));
    record.tags = ['setup'];
    record.topics = ['configuration'];
    record.retrievalTerms = ['setup'];
    record.claims[0].text = 'Use the approved guide to set up the product.';
    record.review = { ...record.review, privacyReviewed: true, freshnessReviewed: true, authorityReviewed: true };
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    await writeFile(path.join(root, 'app', 'knowledge', 'drafts', 'knowledge_safe-guide', 'document.md'), '# Safe Guide\n\nUse the approved guide to set up the product.\n', 'utf8');
    await approveDraft(service, { documentId: 'knowledge_safe-guide', approvedBy: 'human-admin', declaration: 'HUMAN_APPROVAL_CONFIRMED' });
    await writeFile(path.join(root, 'app', 'knowledge', 'sources', 'safe-guide.txt'), 'The authoritative guide has changed.', 'utf8');
    await scanSources(service);
    const validation = await validateKnowledgeBase(service, { areas: ['approved'] });
    assert.ok(validation.data.errors.some((error) => error.code === 'KNOWLEDGE_DOCUMENT_SOURCE_STALE'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('rejects a relationship proposal with missing target knowledge', async () => {
  const root = await fixtureProject();
  try {
    const { service } = await prepareDraft(root);
    const recordPath = path.join(root, 'app', 'knowledge', 'drafts', 'knowledge_safe-guide', 'record.json');
    const record = JSON.parse(await readFile(recordPath, 'utf8'));
    record.tags = ['setup'];
    record.topics = ['configuration'];
    record.retrievalTerms = ['setup'];
    record.claims[0].text = 'Use the approved guide to set up the product.';
    record.relationships = [{ type: 'related_to', targetDocumentId: 'knowledge_missing-guide', evidenceClaimIds: ['claim_draft-required'] }];
    record.review = { ...record.review, privacyReviewed: true, freshnessReviewed: true, authorityReviewed: true };
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    await writeFile(path.join(root, 'app', 'knowledge', 'drafts', 'knowledge_safe-guide', 'document.md'), '# Safe Guide\n\nUse the approved guide to set up the product.\n', 'utf8');
    const validation = await validateKnowledgeBase(service);
    assert.ok(validation.data.errors.some((error) => error.code === 'KNOWLEDGE_RELATIONSHIP_TARGET_MISSING'));
    await assert.rejects(() => approveDraft(service, { documentId: 'knowledge_safe-guide', approvedBy: 'human-admin', declaration: 'HUMAN_APPROVAL_CONFIRMED' }), /blocking validation errors/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
