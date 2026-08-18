import { existsSync } from 'node:fs';
import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';

import { validateContractInstance } from '../contracts/contract-registry.js';
import { FoundationError } from '../core/foundation-error.js';
import { assertDirectoryWithoutSymlinks, readStrictJsonFile, resolveInside, writeJsonAtomic } from '../core/safe-filesystem.js';
import { createGatewayId, createSourceExpansionToken, sha256Hex } from './gateway-security.js';

const RECORDS = Object.freeze({ jobs: ['gateway-job.contract.json', /^gatewayjob_[a-f0-9]{32}$/u], callbacks: ['gateway-callback-outbox.contract.json', /^gatewaycallback_[a-f0-9]{32}$/u], nonces: ['gateway-nonce.contract.json', /^gatewaynonce_[a-f0-9]{64}$/u], sources: ['gateway-source-expansion.contract.json', /^gatewaysource_[a-f0-9]{64}$/u] });

export function createGatewayStore({ deploymentRoot, configuration, contracts, now = () => new Date().toISOString() } = {}) {
  if (!deploymentRoot || !configuration?.gateway || !contracts) throw new FoundationError('Gateway storage dependencies are missing.', { code: 'GATEWAY_STORE_DEPENDENCY_MISSING' });
  resolveInside(deploymentRoot, configuration.gateway.dataDirectory, 'gateway data directory');
  return Object.freeze({ deploymentRoot, configuration, contracts, now, locks: new Map() });
}

export async function consumeGatewayNonce(store, { callerId, nonce, expiresAt }) {
  const nonceHash = sha256Hex(`${callerId}\u0000${nonce}`);
  const id = `gatewaynonce_${nonceHash}`;
  return serial(store, `nonce:${id}`, async () => {
    const old = await optional(store, 'nonces', id);
    if (old && Date.parse(old.expiresAt) > Date.parse(store.now())) throw new FoundationError('The signed request has already been used.', { code: 'GATEWAY_NONCE_REPLAY' });
    const value = { schemaVersion: 1, id, callerId, nonceHash, consumedAt: store.now(), expiresAt };
    assertContract(store, 'gateway-nonce.contract.json', value);
    await put(store, 'nonces', id, value);
    return Object.freeze(value);
  });
}

export async function acceptGatewayJob(store, { request, idempotencyKey, requestHash, caller }) {
  assertContract(store, 'http-turn.contract.json', request);
  return serial(store, `intake:${caller.callerId}`, async () => {
    const jobs = await listGatewayJobs(store);
    const same = jobs.find((job) => job.callerId === caller.callerId && job.idempotencyKey === idempotencyKey);
    if (same) {
      if (same.requestHash !== requestHash) throw new FoundationError('Idempotency key conflicts with a prior request.', { code: 'GATEWAY_IDEMPOTENCY_CONFLICT' });
      return Object.freeze({ acknowledgement: acknowledgement(same), duplicate: true, job: same });
    }
    const pending = jobs.filter((job) => job.callerId === caller.callerId && ['accepted', 'processing'].includes(job.status)).length;
    if (pending >= caller.maxPendingJobs) throw new FoundationError('Caller queue limit is reached.', { code: 'GATEWAY_QUEUE_LIMIT' });
    const at = store.now();
    const job = { schemaVersion: 1, id: createGatewayId('gatewayjob'), callerId: caller.callerId, requestId: request.requestId, idempotencyKey, requestHash, sequence: jobs.reduce((maximum, item) => Math.max(maximum, item.sequence), 0) + 1, request, status: 'accepted', attemptCount: 0, leaseExpiresAt: null, callbackId: null, failureCode: null, acceptedAt: at, updatedAt: at, expiresAt: addDays(at, store.configuration.gateway.jobRetentionDays) };
    assertContract(store, 'gateway-job.contract.json', job);
    await put(store, 'jobs', job.id, job);
    return Object.freeze({ acknowledgement: acknowledgement(job), duplicate: false, job: Object.freeze(job) });
  });
}

export async function claimNextGatewayJob(store, { leaseSeconds = 90 } = {}) {
  return serial(store, 'worker', async () => {
    const jobs = await recoverExpiredLeases(store, 'jobs', await listGatewayJobs(store));
    const candidate = jobs.filter((job) => job.status === 'accepted').sort((left, right) => left.sequence - right.sequence).find((job) => !jobs.some((other) => other.id !== job.id && other.callerId === job.callerId && other.request.conversationId === job.request.conversationId && other.request.userId === job.request.userId && other.sequence < job.sequence && ['accepted', 'processing'].includes(other.status)));
    if (!candidate) return null;
    const claimed = { ...candidate, status: 'processing', attemptCount: candidate.attemptCount + 1, leaseExpiresAt: addSeconds(store.now(), leaseSeconds), updatedAt: store.now() };
    assertContract(store, 'gateway-job.contract.json', claimed);
    await put(store, 'jobs', claimed.id, claimed);
    return Object.freeze(claimed);
  });
}

export async function completeGatewayJob(store, { job, turn, sourceEvidence, caller, safeFailure = false, failureCode = null }) {
  return serial(store, `job:${job?.id}`, async () => {
    if (!job || job.status !== 'processing') throw new FoundationError('Gateway job is not claimed.', { code: 'GATEWAY_JOB_STATE_INVALID' });
    const current = await get(store, 'jobs', job.id);
    if (current.status !== 'processing') throw new FoundationError('Gateway job state changed.', { code: 'GATEWAY_JOB_STATE_INVALID' });
    const at = turn.completedAt;
    let sourceAccess = null;
    const sources = caller.sourceExpansionEnabled ? normalizeSources(sourceEvidence) : [];
    if (sources.length) {
      sourceAccess = createSourceExpansionToken();
      const tokenHash = sha256Hex(sourceAccess);
      const source = { schemaVersion: 1, id: `gatewaysource_${tokenHash}`, callerId: caller.callerId, jobId: current.id, turnId: turn.turnId, tokenHash, sources, createdAt: at, expiresAt: addSeconds(at, store.configuration.gateway.sourceExpansionTokenTtlSeconds) };
      assertContract(store, 'gateway-source-expansion.contract.json', source);
      await put(store, 'sources', source.id, source);
    }
    const callbackId = createGatewayId('gatewaycallback');
    const payload = { schemaVersion: 1, callbackId, requestId: current.requestId, jobId: current.id, conversationId: current.request.conversationId, userId: current.request.userId, turn: { status: safeFailure ? 'temporarily_unavailable' : 'completed', text: turn.text, language: turn.language, completedAt: at }, sources: { available: sourceAccess !== null, expansionToken: sourceAccess } };
    assertContract(store, 'http-turn-callback.contract.json', payload);
    const outbox = { schemaVersion: 1, id: callbackId, jobId: current.id, callerId: caller.callerId, callbackUrl: current.request.callbackUrl, payload, status: 'pending', attemptCount: 0, maxAttempts: caller.maxCallbackAttempts, nextAttemptAt: at, leaseExpiresAt: null, lastStatusCode: null, lastFailureCategory: null, createdAt: at, updatedAt: at, expiresAt: addDays(at, store.configuration.gateway.callbackRetentionDays) };
    assertContract(store, 'gateway-callback-outbox.contract.json', outbox);
    await put(store, 'callbacks', outbox.id, outbox);
    const done = { ...current, status: safeFailure ? 'failed_safe' : 'completed', callbackId, failureCode: safeFailure ? safeOperationalCode(failureCode) : null, leaseExpiresAt: null, updatedAt: at };
    assertContract(store, 'gateway-job.contract.json', done);
    await put(store, 'jobs', done.id, done);
    return Object.freeze({ job: done, outbox });
  });
}

export async function claimDueGatewayCallback(store, { leaseSeconds = 60 } = {}) {
  return serial(store, 'callback-worker', async () => {
    const callbacks = await recoverExpiredLeases(store, 'callbacks', await listGatewayCallbacks(store));
    const now = Date.parse(store.now());
    const candidate = callbacks.filter((item) => ['pending', 'retry_wait'].includes(item.status) && Date.parse(item.nextAttemptAt) <= now).sort((left, right) => left.nextAttemptAt.localeCompare(right.nextAttemptAt) || left.id.localeCompare(right.id))[0];
    if (!candidate) return null;
    const claimed = { ...candidate, status: 'delivering', leaseExpiresAt: addSeconds(store.now(), leaseSeconds), updatedAt: store.now() };
    assertContract(store, 'gateway-callback-outbox.contract.json', claimed);
    await put(store, 'callbacks', claimed.id, claimed);
    return Object.freeze(claimed);
  });
}

export async function recordGatewayCallbackAttempt(store, { callback, delivered, statusCode = null, failureCategory = null }) {
  return serial(store, `callback:${callback?.id}`, async () => {
    if (!callback || callback.status !== 'delivering') throw new FoundationError('Gateway callback is not claimed.', { code: 'GATEWAY_CALLBACK_STATE_INVALID' });
    const current = await get(store, 'callbacks', callback.id);
    if (current.status !== 'delivering') throw new FoundationError('Gateway callback state changed.', { code: 'GATEWAY_CALLBACK_STATE_INVALID' });
    const attemptCount = current.attemptCount + 1;
    const terminal = !delivered && attemptCount >= current.maxAttempts;
    const at = store.now();
    const value = delivered
      ? { ...current, status: 'delivered', attemptCount, leaseExpiresAt: null, lastStatusCode: statusCode, lastFailureCategory: null, updatedAt: at }
      : { ...current, status: terminal ? 'terminal_failed' : 'retry_wait', attemptCount, leaseExpiresAt: null, lastStatusCode: statusCode, lastFailureCategory: normalizedFailure(failureCategory), nextAttemptAt: terminal ? current.nextAttemptAt : addSeconds(at, retryDelay(store, attemptCount)), updatedAt: at };
    assertContract(store, 'gateway-callback-outbox.contract.json', value);
    await put(store, 'callbacks', value.id, value);
    return Object.freeze(value);
  });
}

export async function getGatewaySourceExpansion(store, { callerId, token }) {
  const value = await optional(store, 'sources', `gatewaysource_${sha256Hex(token)}`);
  if (!value || value.callerId !== callerId || Date.parse(value.expiresAt) <= Date.parse(store.now())) throw new FoundationError('Source expansion is unavailable.', { code: 'GATEWAY_SOURCE_EXPANSION_UNAVAILABLE' });
  return Object.freeze({ schemaVersion: 1, turnId: value.turnId, sources: value.sources.map(({ title, section, page, excerpt }) => ({ title, section, page, excerpt })) });
}

export async function listGatewayJobs(store) { return list(store, 'jobs'); }
export async function listGatewayCallbacks(store) { return list(store, 'callbacks'); }
export async function cleanupGatewayStore(store, { limit = 1000 } = {}) {
  let remaining = limit;
  const result = {};
  for (const key of Object.keys(RECORDS)) {
    const value = await cleanup(store, key, remaining);
    result[key] = value;
    remaining -= value.scanned;
    if (remaining <= 0) break;
  }
  return Object.freeze(result);
}

function acknowledgement(job) { return Object.freeze({ schemaVersion: 1, requestId: job.requestId, jobId: job.id, status: 'accepted', acceptedAt: job.acceptedAt }); }
function normalizeSources(items = []) { return items.slice(0, 20).map((item) => ({ title: String(item.title ?? '').slice(0, 300), language: String(item.language ?? '').slice(0, 8), section: item.section === null ? null : String(item.section ?? '').slice(0, 500) || null, page: Number.isInteger(item.page) && item.page > 0 ? item.page : null, excerpt: String(item.excerpt ?? '').slice(0, 2000) })).filter((item) => item.title && /^[a-z]{2,3}(?:-[A-Z]{2})?$/u.test(item.language) && item.excerpt); }
function addSeconds(at, seconds) { return new Date(Date.parse(at) + seconds * 1000).toISOString(); }
function addDays(at, days) { const date = new Date(at); date.setUTCDate(date.getUTCDate() + days); return date.toISOString(); }
function retryDelay(store, attempt) { return store.configuration.gateway.callbackRetryDelaysSeconds[Math.min(attempt - 1, store.configuration.gateway.callbackRetryDelaysSeconds.length - 1)]; }
function normalizedFailure(value) { const text = String(value ?? 'gateway.delivery_failed').toLowerCase().replace(/[^a-z0-9_.-]+/gu, '_').slice(0, 128); return /^[a-z][a-z0-9_.-]{2,127}$/u.test(text) ? text : 'gateway.delivery_failed'; }
function safeOperationalCode(value) { return typeof value === 'string' && /^[A-Z][A-Z0-9_]{2,127}$/u.test(value) ? value : 'GATEWAY_RUNTIME_FAILURE'; }
function serial(store, key, work) { const previous = store.locks.get(key) ?? Promise.resolve(); const current = previous.catch(() => undefined).then(work); store.locks.set(key, current); current.finally(() => { if (store.locks.get(key) === current) store.locks.delete(key); }).catch(() => undefined); return current; }
async function put(store, directory, id, value) { return writeJsonAtomic(store.deploymentRoot, path.posix.join(store.configuration.gateway.dataDirectory, directory, `${id}.json`), value); }
async function get(store, directory, id) { const [contract] = RECORDS[directory]; const value = await readStrictJsonFile(resolveInside(store.deploymentRoot, path.posix.join(store.configuration.gateway.dataDirectory, directory, `${id}.json`), 'gateway record'), { maxBytes: 2_000_000 }); assertContract(store, contract, value); return value; }
async function optional(store, directory, id) { const file = resolveInside(store.deploymentRoot, path.posix.join(store.configuration.gateway.dataDirectory, directory, `${id}.json`), 'gateway record'); return existsSync(file) ? get(store, directory, id) : null; }
async function list(store, directory) { const [contract, pattern] = RECORDS[directory]; const root = resolveInside(store.deploymentRoot, path.posix.join(store.configuration.gateway.dataDirectory, directory), 'gateway directory'); if (!existsSync(root)) return []; await assertDirectoryWithoutSymlinks(root, { rootDirectory: store.deploymentRoot }); const items = []; for (const entry of (await readdir(root, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) { const id = entry.name.slice(0, -5); if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.json') || !pattern.test(id)) continue; try { const value = await get(store, directory, id); assertContract(store, contract, value); items.push(Object.freeze(value)); } catch { /* corrupted data is never executable */ } } return items; }
async function recoverExpiredLeases(store, directory, values) { const now = Date.parse(store.now()); const [contract] = RECORDS[directory]; const output = []; for (const value of values) { const active = directory === 'jobs' ? value.status === 'processing' : value.status === 'delivering'; if (active && Date.parse(value.leaseExpiresAt ?? '') <= now) { const recovered = directory === 'jobs' ? { ...value, status: 'accepted', leaseExpiresAt: null, updatedAt: store.now() } : { ...value, status: 'retry_wait', leaseExpiresAt: null, nextAttemptAt: store.now(), lastFailureCategory: 'gateway.delivery_lease_expired', updatedAt: store.now() }; assertContract(store, contract, recovered); await put(store, directory, recovered.id, recovered); output.push(recovered); } else output.push(value); } return output; }
async function cleanup(store, directory, limit) { if (!Number.isInteger(limit) || limit < 1) return Object.freeze({ scanned: 0, deleted: 0, skipped: 0 }); const root = resolveInside(store.deploymentRoot, path.posix.join(store.configuration.gateway.dataDirectory, directory), 'gateway directory'); if (!existsSync(root)) return Object.freeze({ scanned: 0, deleted: 0, skipped: 0 }); await assertDirectoryWithoutSymlinks(root, { rootDirectory: store.deploymentRoot }); let scanned = 0; let deleted = 0; let skipped = 0; for (const entry of await readdir(root, { withFileTypes: true })) { if (scanned >= limit) break; if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.json')) { skipped += 1; continue; } scanned += 1; try { const value = await readStrictJsonFile(path.join(root, entry.name), { maxBytes: 2_000_000 }); if (Date.parse(value.expiresAt) <= Date.parse(store.now())) { await unlink(path.join(root, entry.name)); deleted += 1; } } catch { skipped += 1; } } return Object.freeze({ scanned, deleted, skipped }); }
function assertContract(store, name, value) { const check = validateContractInstance(store.contracts[name], value); if (!check.valid) throw new FoundationError(`Gateway contract validation failed: ${check.failures.join('; ')}`, { code: 'GATEWAY_CONTRACT_INVALID' }); }
