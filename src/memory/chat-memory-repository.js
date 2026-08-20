import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { validateContractInstance } from '../contracts/contract-registry.js';
import { FoundationError } from '../core/foundation-error.js';
import { resolveInside } from '../core/safe-filesystem.js';

function assertContract(contracts, name, value) {
  const result = validateContractInstance(contracts[name], value);
  if (!result.valid) throw new FoundationError(`${name} validation failed: ${result.failures.join('; ')}`, { code: 'CHAT_MEMORY_CONTRACT_INVALID' });
}

function memoryKey({ assistantId, conversationId, userId }) { return createHash('sha256').update(`${assistantId}\u0000${conversationId}\u0000${userId}`).digest('hex'); }
function iso(now) { return now().toISOString(); }
function expiresAt(now, retentionDays) { return new Date(now().getTime() + (retentionDays * 86_400_000)).toISOString(); }
function truncate(text, maximum) { return String(text).trim().slice(0, maximum); }
const CREDENTIAL_ASSIGNMENT = String.raw`(?:\s*(?::|=)\s*|\s+(?:is|es)\s+)\S+`;
function containsSensitiveMemoryData(value) {
  const text = String(value);
  return new RegExp(String.raw`\b(?:bearer\s+)?(?:sk|AIza)[A-Za-z0-9_-]{16,}\b|\b(?:api[_ -]?key|token|password|contrase(?:\u00f1|n)a|one[- ]?time code|(?:verification|authentication) code|otp|(?:c\u00f3|co)digo(?:\s+de)?\s+(?:verificaci\u00f3n|autenticaci\u00f3n))${CREDENTIAL_ASSIGNMENT}|\b(?:card|tarjeta|cvv|cvc)${CREDENTIAL_ASSIGNMENT}|\b\d(?:[ -]?\d){12,18}\b|\b[a-f0-9]{32,}\b`, 'iu').test(text);
}

export function sanitizeMemoryText(value, maximum) {
  const text = String(value);
  if (containsSensitiveMemoryData(text)) return '';
  if (/\b(?:bearer\s+)?(?:sk|AIza)[A-Za-z0-9_-]{16,}\b/iu.test(text) || new RegExp(String.raw`\b(?:api[_ -]?key|token|password|contrase(?:ñ|n)a|one[- ]?time code)${CREDENTIAL_ASSIGNMENT}`, 'iu').test(text) || /\b[a-f0-9]{32,}\b/iu.test(text)) return '';
  return truncate(text, maximum);
}

function extractPreferredName(text, sourceTurnId, now) {
  const match = /\b(?:my name is|call me|me llamo|llamame)\s+([\p{L}][\p{L}'-]{1,79})/iu.exec(text);
  if (!match) return null;
  const timestamp = iso(now);
  return { schemaVersion: 1, id: `memory_fact_${randomUUID().replaceAll('-', '')}`, kind: 'preferred_name', value: match[1], sourceTurnId, status: 'active', createdAt: timestamp, updatedAt: timestamp };
}

function compactSummary(previous, evicted, revision, now, maximum) {
  if (maximum === 0 || evicted.length === 0) return previous;
  const parts = [previous?.text, ...evicted.map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.text}`)].filter(Boolean);
  const text = truncate(parts.join('\n'), maximum);
  return text ? { schemaVersion: 1, text, throughRevision: revision, updatedAt: iso(now) } : null;
}

function applyPreferredName(facts, candidate) {
  if (!candidate) return facts;
  const next = facts.map((fact) => fact.kind === 'preferred_name' && fact.status === 'active' ? { ...fact, status: 'superseded', updatedAt: candidate.createdAt } : fact);
  return [...next, candidate];
}

export function createChatMemoryRepository({ projectRoot, configuration, contracts, now = () => new Date() } = {}) {
  if (!projectRoot || !configuration || !contracts) throw new TypeError('projectRoot, configuration, and contracts are required.');
  return Object.freeze({ projectRoot, configuration, contracts, now, directory: resolveInside(projectRoot, configuration.chatMemory.directory, 'chat memory directory'), locks: new Map() });
}

function filePath(repository, scope) { return path.join(repository.directory, `${memoryKey(scope)}.json`); }

export async function loadChatMemory(repository, scope) {
  if (!repository.configuration.chatMemory.enabled) return null;
  const target = filePath(repository, scope);
  let snapshot;
  try { snapshot = JSON.parse(await readFile(target, 'utf8')); } catch (error) { if (error?.code === 'ENOENT') return null; throw new FoundationError('Chat memory could not be read.', { code: 'CHAT_MEMORY_READ_FAILED', cause: error }); }
  assertContract(repository.contracts, 'chat-memory-snapshot.contract.json', snapshot);
  if (snapshot.assistantId !== scope.assistantId || snapshot.conversationId !== scope.conversationId || snapshot.userId !== scope.userId) throw new FoundationError('Chat memory scope mismatch.', { code: 'CHAT_MEMORY_SCOPE_INVALID' });
  if (Date.parse(snapshot.expiresAt) <= repository.now().getTime()) { await rm(target, { force: true }); return null; }
  return Object.freeze(snapshot);
}

export async function appendChatMemory(repository, { scope, userTurn, assistantTurn, knowledgeVersion = null } = {}) {
  if (!repository.configuration.chatMemory.enabled) return Object.freeze({ persisted: false, snapshot: null });
  const lockKey = memoryKey(scope); const previous = repository.locks.get(lockKey) ?? Promise.resolve();
  let release; const current = new Promise((resolve) => { release = resolve; }); repository.locks.set(lockKey, current);
  await previous;
  try {
  const policy = repository.configuration.chatMemory;
  const existing = await loadChatMemory(repository, scope);
  const timestamp = iso(repository.now);
  const userTurnContainsSensitiveData = containsSensitiveMemoryData(userTurn.text);
  const sanitizedUserText = sanitizeMemoryText(userTurn.text, policy.maxRecentTurnCharacters); const sanitizedAssistantText = userTurnContainsSensitiveData ? '' : sanitizeMemoryText(assistantTurn.text, policy.maxRecentTurnCharacters);
  const turns = [...(existing?.recentTurns ?? []), ...(sanitizedUserText ? [{ schemaVersion: 1, id: userTurn.id, role: 'user', text: sanitizedUserText, createdAt: timestamp }] : []), ...(sanitizedAssistantText ? [{ schemaVersion: 1, id: assistantTurn.id, role: 'assistant', text: sanitizedAssistantText, createdAt: timestamp }] : [])];
  const maximumMessages = policy.maxRecentTurns * 2;
  const evicted = turns.slice(0, Math.max(0, turns.length - maximumMessages));
  const recentTurns = turns.slice(-maximumMessages);
  const revision = (existing?.revision ?? 0) + 1;
  const candidate = userTurnContainsSensitiveData ? null : extractPreferredName(userTurn.text, userTurn.id, repository.now);
  const facts = applyPreferredName(existing?.chatFacts ?? [], candidate).slice(-policy.maxChatFacts);
  const snapshot = { schemaVersion: 1, assistantId: scope.assistantId, conversationId: scope.conversationId, userId: scope.userId, revision, recentTurns, summary: compactSummary(existing?.summary ?? null, evicted, revision, repository.now, policy.maxSummaryCharacters), chatFacts: facts, knowledgeVersion, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp, lastInteractionAt: timestamp, expiresAt: expiresAt(repository.now, policy.retentionDays) };
  assertContract(repository.contracts, 'chat-memory-snapshot.contract.json', snapshot);
  await mkdir(repository.directory, { recursive: true });
  const target = filePath(repository, scope); const temporary = `${target}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, `${JSON.stringify(snapshot)}\n`, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, target); } finally { await rm(temporary, { force: true }); }
  return Object.freeze({ persisted: true, snapshot: Object.freeze(snapshot) });
  } finally { release(); if (repository.locks.get(lockKey) === current) repository.locks.delete(lockKey); }
}

export async function cleanupExpiredChatMemory(repository) {
  if (!repository.configuration.chatMemory.enabled) return Object.freeze({ scanned: 0, deleted: 0 });
  let entries; try { entries = await readdir(repository.directory, { withFileTypes: true }); } catch (error) { if (error?.code === 'ENOENT') return Object.freeze({ scanned: 0, deleted: 0 }); throw new FoundationError('Chat memory cleanup could not list storage.', { code: 'CHAT_MEMORY_CLEANUP_FAILED', cause: error }); }
  let scanned = 0; let deleted = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/u.test(entry.name)) continue;
    scanned += 1; const target = path.join(repository.directory, entry.name);
    try { const snapshot = JSON.parse(await readFile(target, 'utf8')); if (Date.parse(snapshot.expiresAt) <= repository.now().getTime()) { await rm(target, { force: true }); deleted += 1; } } catch { /* Preserve malformed records for administrator diagnosis. */ }
  }
  return Object.freeze({ scanned, deleted });
}
