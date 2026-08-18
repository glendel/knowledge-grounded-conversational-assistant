import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDocument, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { validateContractInstance } from '../contracts/contract-registry.js';
import { validateCoreConfiguration } from '../config/core-configuration.js';
import { FoundationError } from '../core/foundation-error.js';
import { assertDirectoryWithoutSymlinks, listRegularFiles, readFileLimited, readStrictJsonFile, resolveInside, sha256File, writeJsonAtomic, writeTextAtomic } from '../core/safe-filesystem.js';
import { redactSensitiveText, detectSensitiveCandidates } from '../security/content-safety.js';

const SOURCE_FILE_TYPES = Object.freeze({ '.pdf': 'pdf', '.json': 'json', '.txt': 'text', '.md': 'markdown', '.markdown': 'markdown' });
const PLACEHOLDER = 'DRAFT REQUIRED: replace with a supported claim after review.';
const PDF_STANDARD_FONTS_DIRECTORY = `${path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'node_modules', 'pdfjs-dist', 'standard_fonts').replaceAll('\\', '/')}/`;

export async function createKnowledgeAdministration({ deploymentRoot, configuration, contracts, now = () => new Date().toISOString() } = {}) {
  if (typeof deploymentRoot !== 'string' || deploymentRoot.length === 0) {
    throw new FoundationError('An explicit deployment root is required for Knowledge Base administration.', { code: 'KNOWLEDGE_DEPLOYMENT_ROOT_REQUIRED' });
  }
  if (!configuration || typeof configuration !== 'object') {
    throw new FoundationError('A validated configuration is required for Knowledge Base administration.', { code: 'KNOWLEDGE_CONFIGURATION_REQUIRED' });
  }
  if (!contracts || typeof contracts !== 'object') {
    throw new FoundationError('A loaded contract registry is required for Knowledge Base administration.', { code: 'KNOWLEDGE_CONTRACTS_REQUIRED' });
  }
  const resolvedDeploymentRoot = path.resolve(deploymentRoot);
  await assertDirectoryWithoutSymlinks(resolvedDeploymentRoot, { rootDirectory: resolvedDeploymentRoot });
  const validatedConfiguration = validateCoreConfiguration(configuration);
  return Object.freeze({
    deploymentRoot: resolvedDeploymentRoot,
    configuration: validatedConfiguration,
    contracts,
    administration: validatedConfiguration.knowledgeAdministration,
    now
  });
}

export async function scanSources(service) {
  const { deploymentRoot, administration } = service;
  const sourceRoot = resolveInside(deploymentRoot, administration.sourcesDirectory, 'sourcesDirectory');
  await assertDirectoryWithoutSymlinks(sourceRoot, { rootDirectory: deploymentRoot });
  const registry = await loadRegistry(service);
  const files = await listRegularFiles(sourceRoot, { maxDepth: administration.maxSourceDirectoryDepth, maxFiles: administration.maxSourceFiles });
  const observedAt = service.now();
  const activeSourceIds = [];
  let newSourceCount = 0;
  for (const filePath of files) {
    const relativePath = path.relative(sourceRoot, filePath).replaceAll('\\', '/');
    const { byteLength, sha256 } = await sha256File(filePath, { maxBytes: administration.maxSourceFileBytes });
    const id = sourceId(sha256);
    activeSourceIds.push(id);
    if (!registry.sources[id]) {
      registry.sources[id] = { schemaVersion: 1, id, relativePath, fileType: sourceFileType(relativePath), sizeBytes: byteLength, sourceContentSha256: sha256, authority: 'unclassified', storageClassification: 'local_only', extractionStatus: sourceFileType(relativePath) === 'unsupported' ? 'unsupported' : 'registered', observedAt, updatedAt: observedAt };
      newSourceCount += 1;
    } else registry.sources[id] = { ...registry.sources[id], relativePath, sizeBytes: byteLength, observedAt, updatedAt: observedAt };
  }
  registry.activeSourceIds = [...new Set(activeSourceIds)].sort();
  registry.generatedAt = observedAt;
  await validateRegistrySources(service, registry);
  await saveRegistry(service, registry);
  return safeResult(service, 'scan', { totalFiles: files.length, newSourceCount, activeSourceIds: registry.activeSourceIds });
}

export async function classifySource(service, { sourceId: id, authority, storageClassification }) {
  if (!['authoritative', 'supporting', 'historical', 'unclassified'].includes(authority)) throw new FoundationError('Unsupported source authority.', { code: 'KNOWLEDGE_SOURCE_AUTHORITY_INVALID' });
  if (!['local_only', 'safe_to_track', 'protected_store'].includes(storageClassification)) throw new FoundationError('Unsupported source storage classification.', { code: 'KNOWLEDGE_SOURCE_STORAGE_INVALID' });
  const registry = await loadRegistry(service);
  const source = requireActiveSource(registry, id);
  registry.sources[id] = { ...source, authority, storageClassification, updatedAt: service.now() };
  await validateRegistrySources(service, registry);
  await saveRegistry(service, registry);
  return safeResult(service, 'classify', { sourceId: id, authority, storageClassification });
}

export async function extractSource(service, { sourceId: id }) {
  const { deploymentRoot, administration } = service;
  const registry = await loadRegistry(service);
  const source = requireActiveSource(registry, id);
  if (source.fileType === 'unsupported') throw new FoundationError('The registered source type has no approved extractor.', { code: 'KNOWLEDGE_EXTRACTOR_UNSUPPORTED', path: source.relativePath });
  const sourcePath = resolveInside(resolveInside(deploymentRoot, administration.sourcesDirectory, 'sourcesDirectory'), source.relativePath, 'source relativePath');
  await assertDirectoryWithoutSymlinks(path.dirname(sourcePath), { rootDirectory: deploymentRoot });
  const current = await sha256File(sourcePath, { maxBytes: administration.maxSourceFileBytes });
  if (current.sha256 !== source.sourceContentSha256 || current.byteLength !== source.sizeBytes) throw new FoundationError('Source bytes changed after registration. Run scan before extraction.', { code: 'KNOWLEDGE_SOURCE_FINGERPRINT_CHANGED', path: source.relativePath });
  const rawSegments = await extractSegments(sourcePath, source.fileType, administration);
  const artifactRelativePath = path.posix.join(administration.extractedDirectory.replaceAll('\\', '/'), id, source.sourceContentSha256, 'artifact.json');
  const artifact = { schemaVersion: 1, id: extractionId(source.sourceContentSha256), sourceId: id, sourceContentSha256: source.sourceContentSha256, artifactRelativePath, extractor: extractorIdentity(source.fileType), status: rawSegments.some((segment) => segment.text === '[NO_EXTRACTABLE_TEXT]') ? 'needs_review' : 'completed', warnings: rawSegments.filter((segment) => segment.text === '[NO_EXTRACTABLE_TEXT]').map((segment) => `${segment.location} contained no extractable text.`), redactionSummary: summarizeRedactions(rawSegments), segments: rawSegments, createdAt: service.now() };
  assertContract(service, 'knowledge-extraction.contract.json', artifact);
  await writeJsonAtomic(deploymentRoot, artifactRelativePath, artifact);
  registry.sources[id] = { ...source, extractionStatus: artifact.status === 'completed' ? 'extracted' : 'failed', updatedAt: service.now() };
  await saveRegistry(service, registry);
  return safeResult(service, 'extract', { sourceId: id, extractionId: artifact.id, segmentCount: artifact.segments.length, redactionSummary: artifact.redactionSummary, warningCount: artifact.warnings.length, artifactRelativePath });
}
export async function analyzeSource(service, { sourceId: id, aiAdministrator = 'authorized-ai-administrator' }) {
  const artifact = await loadArtifact(service, id);
  const termCounts = new Map();
  for (const segment of artifact.segments) for (const term of tokenize(segment.text)) termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
  const findings = [];
  if (artifact.redactionSummary.total > 0) findings.push({ kind: 'privacy', severity: 'warning', message: 'Deterministic redaction detected candidate sensitive values. Human review is required before drafting.' });
  if (artifact.status === 'needs_review') findings.push({ kind: 'unsupported', severity: 'warning', message: 'One or more source segments contained no extractable text.' });
  const briefing = { schemaVersion: 1, id: briefingId(`${artifact.id}:${aiAdministrator}`), aiAdministrator, generatedAt: service.now(), sourceIds: [id], proposedDocumentIds: [], findings, approvalRequested: false };
  assertContract(service, 'knowledge-review-briefing.contract.json', briefing);
  return safeResult(service, 'analyze', { sourceId: id, segmentCount: artifact.segments.length, redactionSummary: artifact.redactionSummary, topTerms: [...termCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30).map(([term, count]) => ({ term, count })), briefing });
}

export async function createDraft(service, { sourceId: id, documentId, title, language = 'es', aiAdministrator = 'authorized-ai-administrator' }) {
  if (!/^knowledge_[a-z0-9-]{3,80}$/.test(documentId)) throw new FoundationError('Document ID must be a stable lowercase knowledge identifier.', { code: 'KNOWLEDGE_DOCUMENT_ID_INVALID' });
  const artifact = await loadArtifact(service, id);
  const draftDirectory = path.posix.join(service.administration.draftsDirectory.replaceAll('\\', '/'), documentId);
  const recordRelativePath = path.posix.join(draftDirectory, 'record.json');
  if (existsSync(resolveInside(service.deploymentRoot, recordRelativePath))) throw new FoundationError('A draft with this document ID already exists.', { code: 'KNOWLEDGE_DRAFT_EXISTS', path: recordRelativePath });
  const firstSegment = artifact.segments.find((segment) => segment.text !== '[NO_EXTRACTABLE_TEXT]');
  if (!firstSegment) throw new FoundationError('A draft cannot be created without an extractable source segment.', { code: 'KNOWLEDGE_DRAFT_NO_EVIDENCE' });
  const createdAt = service.now();
  const record = { schemaVersion: 1, id: documentId, status: 'draft', title, language, tags: ['needs-curation'], topics: ['needs-curation'], retrievalTerms: ['needs-curation'], sourceRefs: [{ sourceId: id, sourceContentSha256: artifact.sourceContentSha256, segmentIds: [firstSegment.id] }], claims: [{ id: 'claim_draft-required', text: PLACEHOLDER, evidenceRefs: [{ sourceId: id, segmentIds: [firstSegment.id] }] }], relationships: [], review: { aiAdministrator, privacyReviewed: false, freshnessReviewed: false, authorityReviewed: false, humanReviewStatus: 'pending', approvedBy: null, approvedAt: null }, createdAt, updatedAt: createdAt };
  assertContract(service, 'knowledge-document.contract.json', record);
  const markdown = `# ${escapeMarkdown(title)}\n\n> Draft status: requires AI curation and Human Administrator review.\n\n## Scope\n\nDescribe the precise user need this article supports.\n\n## Supported guidance\n\nReplace this placeholder with source-backed guidance.\n\n## Boundaries and escalation\n\nState what this article cannot safely answer.\n`;
  await writeJsonAtomic(service.deploymentRoot, recordRelativePath, record);
  await writeTextAtomic(service.deploymentRoot, path.posix.join(draftDirectory, 'document.md'), markdown);
  return safeResult(service, 'draft-create', { sourceId: id, documentId, recordRelativePath, documentRelativePath: path.posix.join(draftDirectory, 'document.md') });
}

export async function releaseDevelopmentCoverage(service, { sourceId: id, authorizedBy }) {
  if (service.configuration.runtime.environment !== 'development') throw new FoundationError('Development coverage release is available only in the development environment.', { code: 'KNOWLEDGE_DEVELOPMENT_RELEASE_FORBIDDEN' });
  if (!authorizedBy || authorizedBy.length > 120) throw new FoundationError('An explicit development authorization identity is required.', { code: 'KNOWLEDGE_DEVELOPMENT_AUTHORIZATION_REQUIRED' });
  const registry = await loadRegistry(service);
  const source = requireActiveSource(registry, id);
  if (source.authority !== 'authoritative') throw new FoundationError('Development coverage release requires an authoritative source.', { code: 'KNOWLEDGE_SOURCE_AUTHORITY_INSUFFICIENT', path: source.relativePath });
  const artifact = await loadArtifact(service, id);
  const segments = artifact.segments.filter((segment) => segment.text !== '[NO_EXTRACTABLE_TEXT]');
  const createdAt = service.now();
  const documentIds = [];
  for (const segment of segments) {
    const documentId = `knowledge_coverage-${hash(`${id}:${segment.id}`).slice(0, 16)}`;
    const directory = path.posix.join(service.administration.approvedDirectory.replaceAll('\\', '/'), documentId);
    const record = { schemaVersion: 1, id: documentId, status: 'approved', title: `Development coverage: ${source.relativePath} ${segment.location}`, language: 'en', tags: ['development-test', 'source-backed', 'full-coverage'], topics: [source.relativePath], retrievalTerms: [...new Set(tokenize(segment.text))].slice(0, 500), sourceRefs: [{ sourceId: id, sourceContentSha256: source.sourceContentSha256, segmentIds: [segment.id] }], claims: [{ id: 'claim_source-segment', text: segment.text, evidenceRefs: [{ sourceId: id, segmentIds: [segment.id] }] }], relationships: [], review: { aiAdministrator: 'development-coverage-release', privacyReviewed: true, freshnessReviewed: true, authorityReviewed: true, humanReviewStatus: 'approved', approvedBy: authorizedBy, approvedAt: createdAt }, createdAt, updatedAt: createdAt };
    assertContract(service, 'knowledge-document.contract.json', record);
    await writeJsonAtomic(service.deploymentRoot, path.posix.join(directory, 'record.json'), record);
    await writeTextAtomic(service.deploymentRoot, path.posix.join(directory, 'document.md'), `# ${escapeMarkdown(record.title)}\n\n> Development-test coverage: source-backed, not production-certified.\n\n${segment.text}\n`);
    documentIds.push(documentId);
  }
  return safeResult(service, 'development-coverage-release', { sourceId: id, documentCount: documentIds.length, documentIds });
}

export async function validateKnowledgeBase(service, { areas = ['draft', 'approved'] } = {}) {
  const validatedAreas = normalizeValidationAreas(areas);
  const registry = await loadRegistry(service);
  const artifacts = await loadArtifacts(service, registry);
  const documents = await loadDocuments(service, validatedAreas);
  const errors = [];
  const warnings = [];
  for (const document of documents) {
    const { record, relativeDirectory, content, area } = document;
    if (!record) { errors.push({ documentId: document.id, code: 'KNOWLEDGE_DOCUMENT_INCOMPLETE', message: 'Document directory must contain record.json and document.md.' }); continue; }
    try { assertContract(service, 'knowledge-document.contract.json', record); } catch (error) { errors.push(safeError(document.id, error)); continue; }
    if (detectSensitiveCandidates(content).length > 0) errors.push({ documentId: record.id, code: 'KNOWLEDGE_DOCUMENT_SENSITIVE_CONTENT', message: 'Document Markdown contains deterministic sensitive-value candidates.' });
    if (requiresCuration(record)) warnings.push({ documentId: record.id, code: 'KNOWLEDGE_DOCUMENT_CURATION_INCOMPLETE', message: 'Draft contains unresolved curation metadata or claims.' });
    for (const claim of record.claims) if (claim.text !== PLACEHOLDER && !content.includes(claim.text)) errors.push({ documentId: record.id, code: 'KNOWLEDGE_DOCUMENT_CLAIM_NOT_PRESENTED', message: 'Claim ' + claim.id + ' is not present in the reviewed Markdown document.' });
    validateDocumentEvidence(record, registry, artifacts, errors);

    if (area === 'approved' && record.status !== 'approved') errors.push({ documentId: record.id, code: 'KNOWLEDGE_APPROVED_DIRECTORY_STATUS', message: 'Approved directory contains a non-approved document.' });
    if (area === 'draft' && !['draft', 'needs_review', 'rejected'].includes(record.status)) errors.push({ documentId: record.id, code: 'KNOWLEDGE_DRAFT_DIRECTORY_STATUS', message: 'Draft directory contains an invalid lifecycle state.' });
    if (relativeDirectory.includes('..')) errors.push({ documentId: record.id, code: 'KNOWLEDGE_DOCUMENT_PATH_INVALID', message: 'Document path is invalid.' });
  }
  validateRelationships(documents, errors);
  return safeResult(service, 'validate', { documentCount: documents.length, errorCount: errors.length, warningCount: warnings.length, errors, warnings });
}

export async function reviewKnowledgeBase(service, { aiAdministrator = 'authorized-ai-administrator' } = {}) {
  const validation = await validateKnowledgeBase(service);
  const registry = await loadRegistry(service);
  const documents = await loadDocuments(service);
  const proposedDocumentIds = documents.filter((document) => document.area === 'draft' && document.record?.status !== 'rejected').map((document) => document.record.id).sort();
  const findings = [...validation.data.errors.map((error) => ({ kind: error.code.includes('SENSITIVE') ? 'privacy' : 'unsupported', severity: 'blocker', message: error.message })), ...validation.data.warnings.map((warning) => ({ kind: warning.code.includes('PLACEHOLDER') ? 'gap' : 'freshness', severity: 'warning', message: warning.message }))];
  const briefing = { schemaVersion: 1, id: briefingId(`${registry.generatedAt}:${aiAdministrator}:${proposedDocumentIds.join(',')}`), aiAdministrator, generatedAt: service.now(), sourceIds: registry.activeSourceIds, proposedDocumentIds, findings, approvalRequested: false };
  assertContract(service, 'knowledge-review-briefing.contract.json', briefing);
  return safeResult(service, 'review', { briefing, validation: validation.data, requestedHumanAction: proposedDocumentIds.length === 0 ? 'No draft documents require review.' : 'Review the draft records and Markdown, complete all review fields, then explicitly approve or reject each document.' });
}
export async function approveDraft(service, { documentId, approvedBy, declaration }) {
  if (declaration !== 'HUMAN_APPROVAL_CONFIRMED') throw new FoundationError('Approval requires the explicit HUMAN_APPROVAL_CONFIRMED declaration.', { code: 'KNOWLEDGE_HUMAN_APPROVAL_REQUIRED' });
  if (!approvedBy || approvedBy.length > 120) throw new FoundationError('An approving Human Administrator identity is required.', { code: 'KNOWLEDGE_APPROVER_REQUIRED' });
  const draft = await loadDocument(service, 'draft', documentId);
  if (!draft) throw new FoundationError('Draft document was not found.', { code: 'KNOWLEDGE_DRAFT_NOT_FOUND', path: documentId });
  const registry = await loadRegistry(service);
  const validation = await validateKnowledgeBase(service);
  if (validation.data.errors.some((error) => error.documentId === documentId)) throw new FoundationError('Draft has blocking validation errors and cannot be approved.', { code: 'KNOWLEDGE_DRAFT_INVALID', path: documentId });
  if (requiresCuration(draft.record)) throw new FoundationError('Draft still contains unresolved curation metadata or claims.', { code: 'KNOWLEDGE_DRAFT_PLACEHOLDER', path: documentId });
  if (!draft.record.review.privacyReviewed || !draft.record.review.freshnessReviewed || !draft.record.review.authorityReviewed) throw new FoundationError('All AI/Human review checks must be complete before approval.', { code: 'KNOWLEDGE_REVIEW_INCOMPLETE', path: documentId });
  for (const claim of draft.record.claims) {
    const evidenceAuthorities = claim.evidenceRefs.map((reference) => registry.sources[reference.sourceId]?.authority ?? 'unclassified');
    if (!evidenceAuthorities.includes('authoritative')) throw new FoundationError('Each approved claim requires at least one authoritative source reference.', { code: 'KNOWLEDGE_CLAIM_AUTHORITY_INSUFFICIENT', path: `${documentId}:${claim.id}` });
  }
  const approvedAt = service.now();
  const approvedRecord = { ...draft.record, status: 'approved', review: { ...draft.record.review, humanReviewStatus: 'approved', approvedBy, approvedAt }, updatedAt: approvedAt };
  assertContract(service, 'knowledge-document.contract.json', approvedRecord);
  const approval = { schemaVersion: 1, id: approvalId(`${documentId}:${approvedAt}:${approvedBy}`), documentId, decision: 'approved', approvedBy, declaration, reviewChecklist: { provenance: true, privacy: true, freshness: true, authority: true, conflicts: true, evaluationImpact: true }, decidedAt: approvedAt };
  assertContract(service, 'knowledge-approval.contract.json', approval);
  const approvedDirectory = path.posix.join(service.administration.approvedDirectory.replaceAll('\\', '/'), documentId);
  await writeJsonAtomic(service.deploymentRoot, path.posix.join(approvedDirectory, 'record.json'), approvedRecord);
  await writeJsonAtomic(service.deploymentRoot, path.posix.join(approvedDirectory, 'approval.json'), approval);
  await writeTextAtomic(service.deploymentRoot, path.posix.join(approvedDirectory, 'document.md'), draft.content);
  return safeResult(service, 'approve', { documentId, approvedBy, approvedAt, approvedDirectory });
}

export async function rejectDraft(service, { documentId, rejectedBy, reason }) {
  if (!rejectedBy || !reason || reason.length > 500) throw new FoundationError('A rejecting administrator and concise reason are required.', { code: 'KNOWLEDGE_REJECTION_INVALID' });
  const draft = await loadDocument(service, 'draft', documentId);
  if (!draft) throw new FoundationError('Draft document was not found.', { code: 'KNOWLEDGE_DRAFT_NOT_FOUND', path: documentId });
  const record = { ...draft.record, status: 'rejected', review: { ...draft.record.review, humanReviewStatus: 'rejected', approvedBy: rejectedBy, approvedAt: null }, updatedAt: service.now() };
  assertContract(service, 'knowledge-document.contract.json', record);
  await writeJsonAtomic(service.deploymentRoot, path.posix.join(service.administration.draftsDirectory.replaceAll('\\', '/'), documentId, 'record.json'), record);
  return safeResult(service, 'reject', { documentId, rejectedBy, reason });
}

export async function buildIndexes(service) {
  const validation = await validateKnowledgeBase(service, { areas: ['approved'] });
  if (validation.data.errorCount > 0) throw new FoundationError('Knowledge Base has blocking validation errors; indexes were not built.', { code: 'KNOWLEDGE_INDEX_VALIDATION_FAILED' });
  const approved = (await loadDocuments(service, ['approved'])).filter((document) => document.area === 'approved' && document.record.status === 'approved').sort((a, b) => a.record.id.localeCompare(b.record.id));
  const approvedIds = new Set(approved.map((document) => document.record.id));
  const lexical = {};
  const relationships = [];
  const contentHashes = {};
  const sourceHashes = new Set();
  for (const document of approved) {
    const factual = factualPayload(document.record);
    contentHashes[document.record.id] = hash(JSON.stringify(factual));
    for (const sourceRef of document.record.sourceRefs) sourceHashes.add(sourceRef.sourceContentSha256);
    for (const term of tokenize([factual.title, ...factual.tags, ...factual.topics, ...factual.retrievalTerms, ...factual.claims.map((claim) => claim.text)].join(' '))) {
      lexical[term] ??= [];
      if (!lexical[term].includes(document.record.id)) lexical[term].push(document.record.id);
    }
    for (const relationship of document.record.relationships) if (approvedIds.has(relationship.targetDocumentId)) relationships.push({ fromDocumentId: document.record.id, ...relationship });
  }
  for (const ids of Object.values(lexical)) ids.sort();
  relationships.sort((a, b) => `${a.fromDocumentId}:${a.targetDocumentId}:${a.type}`.localeCompare(`${b.fromDocumentId}:${b.targetDocumentId}:${b.type}`));
  const manifestSeed = JSON.stringify({ documentIds: approved.map((document) => document.record.id), contentHashes, sourceHashes: [...sourceHashes].sort() });
  const manifest = { schemaVersion: 1, knowledgeVersion: `knowledge-release_${hash(manifestSeed).slice(0, 32)}`, generatedAt: service.now(), approvedOnly: true, documentIds: approved.map((document) => document.record.id), documentContentSha256: contentHashes, sourceHashes: [...sourceHashes].sort() };
  const lexicalIndex = { schemaVersion: 1, knowledgeVersion: manifest.knowledgeVersion, terms: lexical };
  const relationshipMap = { schemaVersion: 1, knowledgeVersion: manifest.knowledgeVersion, relationships };
  assertContract(service, 'knowledge-index.contract.json', manifest);
  assertContract(service, 'knowledge-lexical-index.contract.json', lexicalIndex);
  assertContract(service, 'knowledge-relationship-map.contract.json', relationshipMap);
  const indexDirectory = service.administration.indexesDirectory.replaceAll('\\', '/');
  await writeJsonAtomic(service.deploymentRoot, path.posix.join(indexDirectory, 'manifest.json'), manifest);
  await writeJsonAtomic(service.deploymentRoot, path.posix.join(indexDirectory, 'lexical-index.json'), lexicalIndex);
  await writeJsonAtomic(service.deploymentRoot, path.posix.join(indexDirectory, 'relationship-map.json'), relationshipMap);
  return safeResult(service, 'index-build', { knowledgeVersion: manifest.knowledgeVersion, documentCount: approved.length, termCount: Object.keys(lexical).length, relationshipCount: relationships.length });
}

export async function evaluateKnowledgeBase(service) {
  const evaluationRoot = resolveInside(service.deploymentRoot, service.administration.evaluationsDirectory, 'evaluationsDirectory');
  if (!existsSync(evaluationRoot)) return safeResult(service, 'evaluate', { caseCount: 0, errors: [{ code: 'KNOWLEDGE_EVALUATIONS_MISSING', message: 'No evaluation directory exists yet.' }], valid: false });
  const indexPath = resolveInside(service.deploymentRoot, path.posix.join(service.administration.indexesDirectory.replaceAll('\\', '/'), 'lexical-index.json'), 'lexical index');
  if (!existsSync(indexPath)) return safeResult(service, 'evaluate', { caseCount: 0, errors: [{ code: 'KNOWLEDGE_EVALUATION_INDEX_MISSING', message: 'Build the approved Knowledge Base index before evaluating retrieval.' }], valid: false });
  let lexicalIndex;
  try {
    lexicalIndex = await readStrictJsonFile(indexPath, { maxBytes: 20_000_000 });
    assertContract(service, 'knowledge-lexical-index.contract.json', lexicalIndex);
  } catch {
    return safeResult(service, 'evaluate', { caseCount: 0, errors: [{ code: 'KNOWLEDGE_EVALUATION_INDEX_INVALID', message: 'The approved lexical index is invalid.' }], valid: false });
  }
  const files = await listRegularFiles(evaluationRoot, { maxDepth: 4, maxFiles: 10_000 });
  const errors = [];
  let caseCount = 0;
  for (const filePath of files.filter((item) => item.endsWith('.json'))) {
    const value = await readStrictJsonFile(filePath, { maxBytes: 1_000_000 });
    for (const evaluationCase of (Array.isArray(value) ? value : [value])) {
      try {
        assertContract(service, 'evaluation-case.contract.json', evaluationCase);
        caseCount += 1;
        const candidates = candidateDocumentIds(lexicalIndex, evaluationCase.input);
        const missingExpected = evaluationCase.expectedKnowledgeIds.filter((id) => !candidates.includes(id));
        if (missingExpected.length > 0) errors.push({ caseId: evaluationCase.id, code: 'KNOWLEDGE_EVALUATION_RETRIEVAL_MISS', message: `Expected approved knowledge was not retrieved: ${missingExpected.join(', ')}.` });
      } catch (error) { errors.push({ caseId: path.basename(filePath), ...safeError(path.basename(filePath), error) }); }
    }
  }
  if (caseCount === 0) errors.push({ code: 'KNOWLEDGE_EVALUATIONS_EMPTY', message: 'At least one reviewed retrieval evaluation case is required.' });
  return safeResult(service, 'evaluate', { caseCount, errors, valid: errors.length === 0 });
}
async function loadRegistry(service) {
  const registryPath = resolveInside(service.deploymentRoot, service.administration.registryPath, 'registryPath');
  await assertDirectoryWithoutSymlinks(path.dirname(registryPath), { rootDirectory: service.deploymentRoot });
  if (!existsSync(registryPath)) return { schemaVersion: 1, generatedAt: service.now(), activeSourceIds: [], sources: {} };
  const registry = await readStrictJsonFile(registryPath, { maxBytes: 10_000_000 });
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.activeSourceIds) || !registry.sources || typeof registry.sources !== 'object' || Array.isArray(registry.sources)) throw new FoundationError('Knowledge source registry is invalid.', { code: 'KNOWLEDGE_REGISTRY_INVALID', path: registryPath });
  return registry;
}
async function saveRegistry(service, registry) { await writeJsonAtomic(service.deploymentRoot, service.administration.registryPath, registry); }
async function validateRegistrySources(service, registry) { for (const source of Object.values(registry.sources)) assertContract(service, 'knowledge-source.contract.json', source); }
function requireActiveSource(registry, id) { const source = registry.sources[id]; if (!source || !registry.activeSourceIds.includes(id)) throw new FoundationError('Active source was not found in the registry.', { code: 'KNOWLEDGE_SOURCE_NOT_FOUND', path: id }); return source; }

async function extractSegments(filePath, fileType, administration) {
  if (fileType === 'pdf') return extractPdf(filePath, administration);
  if (fileType === 'json') return extractJson(filePath, administration);
  return extractText(filePath, administration);
}
async function extractPdf(filePath, administration) {
  const data = new Uint8Array(await readFileLimited(filePath, { maxBytes: administration.maxSourceFileBytes }));
  const task = getDocument({ data, disableWorker: true, stopAtErrors: false, verbosity: VerbosityLevel.ERRORS, standardFontDataUrl: PDF_STANDARD_FONTS_DIRECTORY });
  const document = await task.promise;
  const segments = [];
  let totalCharacters = 0;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const rawText = content.items.map((item) => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' ').trim();
    const redacted = redactSensitiveText(rawText);
    totalCharacters += redacted.text.length;
    if (totalCharacters > administration.maxExtractionTextCharacters || segments.length >= administration.maxExtractionSegments) throw new FoundationError('PDF extraction exceeded configured safety limits.', { code: 'KNOWLEDGE_EXTRACTION_LIMIT', path: filePath });
    segments.push(segment(`page:${pageNumber}`, redacted));
  }
  await task.destroy();
  return segments;
}
async function extractJson(filePath, administration) {
  const value = await readStrictJsonFile(filePath, { maxBytes: administration.maxSourceFileBytes });
  const records = Array.isArray(value) ? value : [value];
  if (records.length > administration.maxExtractionSegments) throw new FoundationError('JSON extraction exceeds the configured segment limit.', { code: 'KNOWLEDGE_EXTRACTION_LIMIT', path: filePath });
  let totalCharacters = 0;
  return records.map((record, index) => { const redacted = redactSensitiveText(JSON.stringify(record)); totalCharacters += redacted.text.length; if (totalCharacters > administration.maxExtractionTextCharacters) throw new FoundationError('JSON extraction exceeded configured text limits.', { code: 'KNOWLEDGE_EXTRACTION_LIMIT', path: filePath }); return segment(`record:${index}`, redacted); });
}
async function extractText(filePath, administration) {
  const raw = await readFileLimited(filePath, { maxBytes: administration.maxSourceFileBytes, encoding: 'utf8' });
  if (raw.charCodeAt(0) === 0xFEFF) throw new FoundationError('Text source must be UTF-8 without BOM.', { code: 'KNOWLEDGE_SOURCE_BOM_FORBIDDEN', path: filePath });
  const pieces = raw.replace(/\r\n/g, '\n').split(/\n{2,}/).map((piece) => piece.trim()).filter(Boolean);
  if (pieces.length === 0) throw new FoundationError('Text source contains no extractable content.', { code: 'KNOWLEDGE_SOURCE_EMPTY', path: filePath });
  if (pieces.length > administration.maxExtractionSegments) throw new FoundationError('Text source exceeds the configured segment limit.', { code: 'KNOWLEDGE_EXTRACTION_LIMIT', path: filePath });
  let totalCharacters = 0;
  return pieces.map((piece, index) => { const redacted = redactSensitiveText(piece); totalCharacters += redacted.text.length; if (totalCharacters > administration.maxExtractionTextCharacters) throw new FoundationError('Text extraction exceeded configured limits.', { code: 'KNOWLEDGE_EXTRACTION_LIMIT', path: filePath }); return segment(`section:${index + 1}`, redacted); });
}
function segment(location, redacted) { return { id: `segment_${hash(`${location}:${redacted.text}`).slice(0, 32)}`, location, text: redacted.text || '[NO_EXTRACTABLE_TEXT]', redactionFindingCount: redacted.findings.length, redactionKinds: countRedactionKinds(redacted.findings) }; }
function summarizeRedactions(segments) {
  const byKind = {};
  for (const item of segments) for (const [kind, count] of Object.entries(item.redactionKinds)) byKind[kind] = (byKind[kind] ?? 0) + count;
  return { total: segments.reduce((total, item) => total + item.redactionFindingCount, 0), byKind };
}
function countRedactionKinds(findings) { const counts = {}; for (const finding of findings) counts[finding.kind] = (counts[finding.kind] ?? 0) + 1; return counts; }
function extractorIdentity(fileType) { return fileType === 'pdf' ? { id: 'pdfjs-local', version: '6.2.108' } : fileType === 'json' ? { id: 'json-local', version: '1' } : { id: 'text-local', version: '1' }; }

async function loadArtifact(service, id) {
  const registry = await loadRegistry(service);
  const source = requireActiveSource(registry, id);
  const relativePath = path.posix.join(service.administration.extractedDirectory.replaceAll('\\', '/'), id, source.sourceContentSha256, 'artifact.json');
  const artifactPath = resolveInside(service.deploymentRoot, relativePath, 'extraction artifact');
  await assertDirectoryWithoutSymlinks(path.dirname(artifactPath), { rootDirectory: service.deploymentRoot });
  if (!existsSync(artifactPath)) throw new FoundationError('Extraction artifact is missing. Extract the source first.', { code: 'KNOWLEDGE_EXTRACTION_MISSING', path: relativePath });
  const artifact = await readStrictJsonFile(artifactPath, { maxBytes: 50_000_000 });
  assertContract(service, 'knowledge-extraction.contract.json', artifact);
  return artifact;
}
async function loadArtifacts(service, registry) { const artifacts = new Map(); for (const id of registry.activeSourceIds) { try { artifacts.set(id, await loadArtifact(service, id)); } catch { continue; } } return artifacts; }
async function loadDocuments(service, areas = ['draft', 'approved']) {
  const documents = [];
  for (const area of areas) {
    const relativeRoot = area === 'draft' ? service.administration.draftsDirectory : service.administration.approvedDirectory;
    const root = resolveInside(service.deploymentRoot, relativeRoot, `${area}Directory`);
    if (!existsSync(root)) continue;
    await assertDirectoryWithoutSymlinks(root, { rootDirectory: service.deploymentRoot });
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const relativeDirectory = path.posix.join(relativeRoot.replaceAll('\\', '/'), entry.name);
      const recordPath = resolveInside(service.deploymentRoot, path.posix.join(relativeDirectory, 'record.json'));
      const contentPath = resolveInside(service.deploymentRoot, path.posix.join(relativeDirectory, 'document.md'));
      await assertDirectoryWithoutSymlinks(path.dirname(recordPath), { rootDirectory: service.deploymentRoot });
      if (!existsSync(recordPath) || !existsSync(contentPath)) {
        documents.push({ id: entry.name, area, relativeDirectory, record: null, content: '' });
        continue;
      }
      const record = await readStrictJsonFile(recordPath, { maxBytes: 2_000_000 });
      const content = await readFileLimited(contentPath, { maxBytes: 2_000_000, encoding: 'utf8' });
      documents.push({ id: record.id, area, relativeDirectory, record, content });
    }
  }
  return documents;
}
async function loadDocument(service, area, documentId) {
  const root = area === 'draft' ? service.administration.draftsDirectory : service.administration.approvedDirectory;
  const directory = path.posix.join(root.replaceAll('\\', '/'), documentId);
  const recordPath = resolveInside(service.deploymentRoot, path.posix.join(directory, 'record.json'));
  const contentPath = resolveInside(service.deploymentRoot, path.posix.join(directory, 'document.md'));
  await assertDirectoryWithoutSymlinks(path.dirname(recordPath), { rootDirectory: service.deploymentRoot });
  if (!existsSync(recordPath) || !existsSync(contentPath)) return null;
  return {
    area,
    relativeDirectory: directory,
    record: await readStrictJsonFile(recordPath, { maxBytes: 2_000_000 }),
    content: await readFileLimited(contentPath, { maxBytes: 2_000_000, encoding: 'utf8' })
  };
}
function assertContract(service, fileName, value) { const contract = service.contracts[fileName]; if (!contract) throw new FoundationError(`Required contract is unavailable: ${fileName}`, { code: 'KNOWLEDGE_CONTRACT_MISSING' }); const result = validateContractInstance(contract, value); if (!result.valid) throw new FoundationError(`Contract validation failed: ${result.failures.join('; ')}`, { code: 'KNOWLEDGE_CONTRACT_INVALID' }); }
function sourceFileType(relativePath) { return SOURCE_FILE_TYPES[path.extname(relativePath).toLowerCase()] ?? 'unsupported'; }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function sourceId(value) { return `source_${hash(`source:${value}`).slice(0, 32)}`; }
function extractionId(value) { return `extraction_${hash(`extraction:${value}`).slice(0, 32)}`; }
function briefingId(value) { return `briefing_${hash(`briefing:${value}`).slice(0, 32)}`; }
function approvalId(value) { return `approval_${hash(`approval:${value}`).slice(0, 32)}`; }
function tokenize(value) { return String(value).toLocaleLowerCase('und').match(/[\p{L}\p{N}]{3,}/gu) ?? []; }
function escapeMarkdown(value) { return String(value).replace(/[\r\n]/g, ' ').trim().slice(0, 300); }
function safeResult(service, operation, data) { const occurredAt = service.now(); return { schemaVersion: 1, status: 'success', correlationId: `knowledge_${hash(`${operation}:${occurredAt}`).slice(0, 32)}`, occurredAt, data, error: null }; }
function safeError(documentId, error) { return { documentId, code: error?.code ?? 'KNOWLEDGE_VALIDATION_FAILED', message: String(error?.message ?? 'Knowledge validation failed.').replace(/\s+/g, ' ').slice(0, 500) }; }
function normalizeValidationAreas(areas) { if (!Array.isArray(areas) || areas.length === 0 || areas.some((area) => !['draft', 'approved'].includes(area))) throw new FoundationError('Knowledge validation areas are invalid.', { code: 'KNOWLEDGE_VALIDATION_AREA_INVALID' }); return [...new Set(areas)]; }
function validateDocumentEvidence(record, registry, artifacts, errors) {
  const activeSourceIds = new Set(registry.activeSourceIds);
  const declaredSourceRefs = new Map(record.sourceRefs.map((reference) => [reference.sourceId, reference]));
  for (const sourceRef of record.sourceRefs) {
    if (!activeSourceIds.has(sourceRef.sourceId)) {
      errors.push({ documentId: record.id, code: 'KNOWLEDGE_DOCUMENT_SOURCE_STALE', message: 'Document source is no longer active and must be reviewed against the replacement source.' });
      continue;
    }
    const artifact = artifacts.get(sourceRef.sourceId);
    if (!artifact || artifact.sourceContentSha256 !== sourceRef.sourceContentSha256) errors.push({ documentId: record.id, code: 'KNOWLEDGE_DOCUMENT_PROVENANCE_MISSING', message: 'Document source provenance does not resolve to a current extraction artifact.' });
    else if (sourceRef.segmentIds.some((segmentId) => !artifact.segments.some((segment) => segment.id === segmentId))) errors.push({ documentId: record.id, code: 'KNOWLEDGE_DOCUMENT_SEGMENT_MISSING', message: 'Document references a missing extraction segment.' });
  }
  for (const claim of record.claims) for (const evidenceRef of claim.evidenceRefs) {
    const sourceRef = declaredSourceRefs.get(evidenceRef.sourceId);
    const artifact = artifacts.get(evidenceRef.sourceId);
    if (!sourceRef || !artifact) errors.push({ documentId: record.id, code: 'KNOWLEDGE_CLAIM_EVIDENCE_PROVENANCE_MISSING', message: `Claim ${claim.id} evidence does not resolve to declared document provenance.` });
    else if (evidenceRef.segmentIds.some((segmentId) => !sourceRef.segmentIds.includes(segmentId) || !artifact.segments.some((segment) => segment.id === segmentId))) errors.push({ documentId: record.id, code: 'KNOWLEDGE_CLAIM_EVIDENCE_SEGMENT_MISSING', message: `Claim ${claim.id} evidence references a missing or undeclared extraction segment.` });
  }
}
function validateRelationships(documents, errors) {
  const byId = new Map(documents.filter((document) => document.record).map((document) => [document.record.id, document]));
  for (const document of documents) {
    if (!document.record) continue;
    const claimIds = new Set(document.record.claims.map((claim) => claim.id));
    for (const relationship of document.record.relationships) {
      if (relationship.evidenceClaimIds.some((claimId) => !claimIds.has(claimId))) errors.push({ documentId: document.record.id, code: 'KNOWLEDGE_RELATIONSHIP_EVIDENCE_MISSING', message: 'Relationship references a missing source claim.' });
      const target = byId.get(relationship.targetDocumentId);
      if (!target) errors.push({ documentId: document.record.id, code: 'KNOWLEDGE_RELATIONSHIP_TARGET_MISSING', message: 'Relationship target document is missing.' });
      else if (document.area === 'approved' && target.area !== 'approved') errors.push({ documentId: document.record.id, code: 'KNOWLEDGE_RELATIONSHIP_TARGET_INELIGIBLE', message: 'Approved knowledge may not link to an unapproved relationship target.' });
    }
  }
}
function requiresCuration(record) { return [...record.tags, ...record.topics, ...record.retrievalTerms].some((value) => value === 'needs-curation') || record.claims.some((claim) => claim.text === PLACEHOLDER); }
function factualPayload(record) { return { id: record.id, title: record.title, language: record.language, tags: record.tags, topics: record.topics, retrievalTerms: record.retrievalTerms, claims: record.claims }; }
function candidateDocumentIds(lexicalIndex, input) { return [...new Set(tokenize(input).flatMap((term) => lexicalIndex.terms[term] ?? []))].sort(); }
