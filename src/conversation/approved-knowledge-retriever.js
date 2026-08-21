import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { validateContractInstance } from '../contracts/contract-registry.js';
import { FoundationError } from '../core/foundation-error.js';
import { assertDirectoryWithoutSymlinks, readStrictJsonFile, resolveInside } from '../core/safe-filesystem.js';

const STOP_TERMS = new Set(['a', 'al', 'and', 'are', 'as', 'at', 'assistant', 'asistente', 'better', 'como', 'con', 'de', 'del', 'do', 'el', 'en', 'entiendo', 'es', 'for', 'how', 'i', 'la', 'las', 'los', 'me', 'mejor', 'mi', 'my', 'no', 'of', 'or', 'para', 'por', 'project', 'proyecto', 'puedo', 'que', 'se', 'su', 'the', 'to', 'un', 'una', 'understand', 'what', 'with', 'y', 'you']);

export function createApprovedKnowledgeRetriever({ descriptor } = {}) {
  if (!descriptor?.deploymentRoot || !descriptor?.configuration || !descriptor?.contracts || !descriptor?.paths?.knowledge) {
    throw new TypeError('A validated deployment descriptor is required.');
  }
  if (descriptor.configuration.knowledgePolicy.approvedOnly !== true || descriptor.configuration.knowledgePolicy.rawSourceRuntimeAccess !== false) {
    throw new FoundationError('Runtime retrieval requires approved-only knowledge policy.', { code: 'RUNTIME_KNOWLEDGE_POLICY_INVALID' });
  }
  return Object.freeze({ descriptor });
}

export async function retrieveApprovedKnowledge(retriever, { message, recentUserMessages = [] } = {}) {
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new FoundationError('A non-empty message is required for approved knowledge retrieval.', { code: 'RUNTIME_MESSAGE_INVALID' });
  }
  if (!Array.isArray(recentUserMessages) || recentUserMessages.some((item) => typeof item !== 'string')) {
    throw new TypeError('recentUserMessages must be an array of strings.');
  }
  const source = await loadApprovedKnowledge(retriever);
  if (source === null) return Object.freeze({ status: 'no_evidence', knowledgeVersion: null, candidates: Object.freeze([]) });

  const retrievalQuery = [message, ...recentUserMessages].join('\n');
  const queryTerms = meaningfulTerms(retrievalQuery);
  const candidateIds = candidateDocumentIds(source.lexicalIndex, queryTerms);
  const termWeights = createTermWeights(source.lexicalIndex, queryTerms, source.records.size);
  const scored = candidateIds
    .map((documentId) => {
      const record = source.records.get(documentId);
      return record ? { record, score: relevance(record, queryTerms, termWeights) } : null;
    })
    .filter((candidate) => candidate && candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.record.id.localeCompare(right.record.id));

  const eligible = selectDiverseCandidates(
    scored,
    queryTerms,
    termWeights,
    retriever.descriptor.configuration.conversationRuntime.maxEvidenceDocuments
  );
  const candidates = selectEvidence(eligible, retrievalQuery, retriever.descriptor.configuration.conversationRuntime.maxEvidenceCharacters);
  return Object.freeze({
    status: candidates.length > 0 ? 'evidence' : 'no_evidence',
    knowledgeVersion: source.manifest.knowledgeVersion,
    candidates: Object.freeze(candidates)
  });
}

async function loadApprovedKnowledge(retriever) {
  const { descriptor } = retriever;
  const { deploymentRoot, contracts, paths } = descriptor;
  const indexDirectory = paths.knowledge.indexesDirectory;
  if (!existsSync(indexDirectory)) return null;
  try {
    await assertDirectoryWithoutSymlinks(indexDirectory, { rootDirectory: deploymentRoot });
  } catch (error) {
    if (error.code === 'FILESYSTEM_FILE_INVALID') return null;
    throw error;
  }

  let manifest;
  let lexicalIndex;
  try {
    manifest = await readStrictJsonFile(path.join(indexDirectory, 'manifest.json'), { maxBytes: 2_000_000 });
    lexicalIndex = await readStrictJsonFile(path.join(indexDirectory, 'lexical-index.json'), { maxBytes: 20_000_000 });
  } catch (error) {
    if (error.code === 'FILESYSTEM_FILE_INVALID') return null;
    throw error;
  }
  assertContract(contracts, 'knowledge-index.contract.json', manifest);
  assertContract(contracts, 'knowledge-lexical-index.contract.json', lexicalIndex);
  if (manifest.approvedOnly !== true || manifest.knowledgeVersion !== lexicalIndex.knowledgeVersion) {
    throw new FoundationError('Approved knowledge indexes are inconsistent.', { code: 'RUNTIME_KNOWLEDGE_INDEX_INVALID' });
  }

  const records = new Map();
  for (const documentId of manifest.documentIds) {
    const recordPath = resolveInside(deploymentRoot, path.posix.join(descriptor.configuration.knowledgeAdministration.approvedDirectory.replaceAll('\\', '/'), documentId, 'record.json'), 'approved knowledge record');
    await assertDirectoryWithoutSymlinks(path.dirname(recordPath), { rootDirectory: deploymentRoot });
    const record = await readStrictJsonFile(recordPath, { maxBytes: 2_000_000 });
    assertContract(contracts, 'knowledge-document.contract.json', record);
    if (record.id !== documentId || record.status !== 'approved' || !manifest.documentContentSha256[documentId]) {
      throw new FoundationError('Approved knowledge record is not eligible for runtime retrieval.', { code: 'RUNTIME_KNOWLEDGE_RECORD_INELIGIBLE' });
    }
    if (contentHash(record) !== manifest.documentContentSha256[documentId]) {
      throw new FoundationError('Approved knowledge record does not match the validated index.', { code: 'RUNTIME_KNOWLEDGE_RECORD_STALE' });
    }
    records.set(documentId, record);
  }
  return Object.freeze({ manifest, lexicalIndex, records });
}

function selectEvidence(candidates, message, maximumCharacters) {
  let remaining = maximumCharacters;
  const selected = [];
  for (const candidate of candidates) {
    const claims = selectClaims(candidate.record.claims, message, Math.min(remaining, 2400));
    if (claims.length === 0 || claims.length > remaining) continue;
    remaining -= claims.length;
    selected.push(Object.freeze({
      documentId: candidate.record.id,
      title: candidate.record.title,
      language: candidate.record.language,
      score: candidate.score,
      claims
    }));
  }
  return selected;
}

function selectClaims(claims, message, maximumCharacters) {
  const terms = new Set(meaningfulTerms(message));
  const ranked = claims
    .map((claim, index) => ({ text: claim.text, index, score: tokenize(claim.text).filter((term) => terms.has(term)).length }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  let remaining = maximumCharacters;
  const selected = [];
  for (const claim of ranked) {
    if (claim.score === 0 && selected.length > 0) break;
    if (claim.text.length > remaining) continue;
    selected.push(claim.text);
    remaining -= claim.text.length + 1;
  }
  return selected.join('\n');
}

function candidateDocumentIds(lexicalIndex, terms) {
  return [...new Set(terms.flatMap((term) => lexicalIndex.terms[term] ?? []))].sort();
}

function relevance(record, terms, termWeights) {
  return terms.reduce((score, term) => score + termRelevance(record, term, termWeights), 0);
}

function termRelevance(record, term, termWeights) {
  const fields = [
    { text: record.title, weight: 12 },
    { text: record.topics.join(' '), weight: 10 },
    { text: record.tags.join(' '), weight: 6 },
    { text: record.retrievalTerms.join(' '), weight: 4 },
    { text: record.claims.map((claim) => claim.text).join(' '), weight: 1 }
  ].map((field) => ({ ...field, terms: new Set(meaningfulTerms(field.text)) }));
  const strongestFieldWeight = Math.max(0, ...fields.filter((field) => field.terms.has(term)).map((field) => field.weight));
  return strongestFieldWeight * (termWeights.get(term) ?? 1);
}

function selectDiverseCandidates(scored, queryTerms, termWeights, maximumDocuments) {
  if (scored.length === 0 || maximumDocuments <= 0) return [];

  const remaining = [...scored];
  const selected = [remaining.shift()];
  const coveredTerms = new Set(matchedTerms(selected[0].record, queryTerms));

  while (selected.length < maximumDocuments && remaining.length > 0) {
    const next = remaining
      .map((candidate) => ({
        candidate,
        uncoveredScore: matchedTerms(candidate.record, queryTerms)
          .filter((term) => !coveredTerms.has(term))
          .reduce((score, term) => score + termRelevance(candidate.record, term, termWeights), 0)
      }))
      .sort((left, right) => right.uncoveredScore - left.uncoveredScore || right.candidate.score - left.candidate.score || left.candidate.record.id.localeCompare(right.candidate.record.id))[0];
    selected.push(next.candidate);
    for (const term of matchedTerms(next.candidate.record, queryTerms)) coveredTerms.add(term);
    remaining.splice(remaining.indexOf(next.candidate), 1);
  }
  return selected;
}

function matchedTerms(record, terms) {
  const fields = [record.title, ...record.topics, ...record.tags, ...record.retrievalTerms, ...record.claims.map((claim) => claim.text)];
  const recordTerms = new Set(meaningfulTerms(fields.join(' ')));
  return terms.filter((term) => recordTerms.has(term));
}

function createTermWeights(lexicalIndex, terms, documentCount) {
  const total = Math.max(1, documentCount);
  return new Map(terms.map((term) => {
    const frequency = lexicalIndex.terms[term]?.length ?? 0;
    return [term, 1 + Math.log((total + 1) / (frequency + 1))];
  }));
}

function tokenize(value) {
  return [...new Set(String(value).toLocaleLowerCase('und').normalize('NFD').replace(/\p{Diacritic}/gu, '').match(/[\p{L}\p{N}]{2,}/gu) ?? [])];
}

function meaningfulTerms(value) {
  return tokenize(value).filter((term) => !STOP_TERMS.has(term));
}

function contentHash(record) {
  const factual = {
    id: record.id,
    title: record.title,
    language: record.language,
    tags: record.tags,
    topics: record.topics,
    retrievalTerms: record.retrievalTerms,
    claims: record.claims
  };
  return createHash('sha256').update(JSON.stringify(factual)).digest('hex');
}

function assertContract(contracts, fileName, value) {
  const contract = contracts[fileName];
  if (!contract) throw new FoundationError('Required contract is unavailable: ' + fileName, { code: 'RUNTIME_CONTRACT_MISSING' });
  const result = validateContractInstance(contract, value);
  if (!result.valid) throw new FoundationError(fileName + ' validation failed: ' + result.failures.join('; '), { code: 'RUNTIME_CONTRACT_INVALID' });
}
