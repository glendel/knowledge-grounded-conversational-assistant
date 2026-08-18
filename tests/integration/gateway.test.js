import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createConversationRuntime } from '../../src/conversation/conversation-runtime.js';
import { createDeploymentDescriptor } from '../../src/deployment/deployment-descriptor.js';
import { createGatewayHttpServer } from '../../src/gateway/gateway-server.js';
import { GATEWAY_HEADERS, signCanonicalMac } from '../../src/gateway/gateway-security.js';
import { createGatewayRuntime, findCaller, runGatewayWork } from '../../src/gateway/gateway-runtime.js';
import { acceptGatewayJob, claimNextGatewayJob, completeGatewayJob, getGatewaySourceExpansion, listGatewayCallbacks, listGatewayJobs } from '../../src/gateway/gateway-store.js';
import { writeSyntheticCoreConfiguration } from '../fixtures/core-configuration.js';

const inboundCredential = 'synthetic-inbound-credential-0123456789';
const outboundCredential = 'synthetic-outbound-credential-012345678';

async function fixture(callbackPort = null, retryDelays = [1]) {
  const deploymentRoot = await mkdtemp(path.join(os.tmpdir(), 'kgca-gateway-'));
  await writeSyntheticCoreConfiguration(path.join(deploymentRoot, 'config'));
  await mkdir(path.join(deploymentRoot, 'app'), { recursive: true });
  const callersPath = path.join(deploymentRoot, 'config', 'registered-callers.json');
  await writeFile(callersPath, `${JSON.stringify({ schemaVersion: 1, callers: [{ schemaVersion: 1, callerId: 'webchat', enabled: true, inboundSecretEnv: 'INBOUND_SECRET', outboundSigningSecretEnv: 'OUTBOUND_SECRET', callbackAllowlist: [{ hostname: 'localhost', pathPrefix: '/callback', port: callbackPort }], allowHttpLocalDevelopment: true, maxRequestBytes: 16000, maxMessageCharacters: 8000, maxPendingJobs: 10, maxCallbackAttempts: 3, sourceExpansionEnabled: true }] }, null, 2)}\n`, 'utf8');
  const gatewayPath = path.join(deploymentRoot, 'config', 'gateway.json');
  const gateway = JSON.parse(await readFile(gatewayPath, 'utf8'));
  gateway.callbackRetryDelaysSeconds = retryDelays;
  await writeFile(gatewayPath, `${JSON.stringify(gateway, null, 2)}\n`, 'utf8');
  return deploymentRoot;
}

function capability(calls, text = 'Hello. How can I help you today?') {
  return { async execute(request) { calls.push(request); return { status: 'success', result: { text }, failure: null }; } };
}

function requestPayload(callbackUrl, id = 'request-01') {
  return { schemaVersion: 1, requestId: id, callerId: 'webchat', conversationId: `conversation-${id}`, userId: `user-${id}`, callbackUrl, message: { id: `message-${id}`, text: 'Hello, can you help me?', languageHint: 'es' } };
}

function signedHeaders({ body, nonce, idempotencyKey, timestamp = new Date().toISOString() }) {
  const input = { method: 'POST', pathname: '/v1/turns', timestamp, nonce, idempotencyKey, rawBody: body, ['secret']: inboundCredential };
  return { 'content-type': 'application/json', [GATEWAY_HEADERS.timestamp]: timestamp, [GATEWAY_HEADERS.nonce]: nonce, [GATEWAY_HEADERS.idempotencyKey]: idempotencyKey, [GATEWAY_HEADERS.signature]: signCanonicalMac(input) };
}

async function startCallback(received, statuses = [204]) {
  const listener = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      received.push({ headers: request.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      response.writeHead(statuses[Math.min(received.length - 1, statuses.length - 1)]);
      response.end();
    });
  });
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  return listener;
}

async function waitUntil(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return predicate();
}

async function createRuntime(deploymentRoot, calls) {
  const descriptor = await createDeploymentDescriptor({ deploymentRoot });
  const conversation = createConversationRuntime({ descriptor, capabilityRuntime: capability(calls) });
  return createGatewayRuntime({ descriptor, conversationRuntime: conversation, qualificationRecords: [], environment: { INBOUND_SECRET: inboundCredential, OUTBOUND_SECRET: outboundCredential } });
}

test('accepts a signed asynchronous turn, ignores untrusted language hints, and delivers one immutable signed callback', async () => {
  const received = [];
  const calls = [];
  const callback = await startCallback(received);
  const deploymentRoot = await fixture(callback.address().port);
  let service = null;
  try {
    const runtime = await createRuntime(deploymentRoot, calls);
    service = createGatewayHttpServer({ runtime });
    const address = await service.listen();
    const payload = requestPayload(`http://localhost:${callback.address().port}/callback`);
    const body = JSON.stringify(payload);
    const endpoint = `http://${address.address}:${address.port}/v1/turns`;
    const first = await fetch(endpoint, { method: 'POST', headers: signedHeaders({ body, nonce: 'nonce-first-123456', idempotencyKey: 'idem-01' }), body });
    const acknowledgement = await first.json();
    assert.equal(first.status, 202);
    assert.equal(acknowledgement.status, 'accepted');
    assert.equal(await waitUntil(() => received.length === 1), true);
    assert.equal(calls.length, 1);
    assert.equal(received[0].body.turn.language, 'en');
    assert.match(received[0].headers['x-kgca-signature'], /^v1=/);

    const duplicate = await fetch(endpoint, { method: 'POST', headers: signedHeaders({ body, nonce: 'nonce-second-12345', idempotencyKey: 'idem-01' }), body });
    assert.deepEqual(await duplicate.json(), acknowledgement);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(calls.length, 1);
    assert.equal((await listGatewayJobs(runtime.store)).length, 1);
    assert.equal((await listGatewayCallbacks(runtime.store))[0].status, 'delivered');
  } finally {
    if (service) await service.close();
    await new Promise((resolve) => callback.close(resolve));
    await rm(deploymentRoot, { recursive: true, force: true });
  }
});

test('rejects stale and replayed signed input without creating a second job', async () => {
  const calls = [];
  const deploymentRoot = await fixture();
  let service = null;
  try {
    const runtime = await createRuntime(deploymentRoot, calls);
    service = createGatewayHttpServer({ runtime });
    const address = await service.listen();
    const payload = requestPayload('http://localhost/callback', 'request-02');
    const body = JSON.stringify(payload);
    const endpoint = `http://${address.address}:${address.port}/v1/turns`;
    const timestamp = '2000-01-01T00:00:00.000Z';
    const stale = await fetch(endpoint, { method: 'POST', headers: signedHeaders({ body, nonce: 'nonce-stale-123456', idempotencyKey: 'idem-02', timestamp }), body });
    assert.equal(stale.status, 401);
    assert.equal((await listGatewayJobs(runtime.store)).length, 0);
  } finally {
    if (service) await service.close();
    await rm(deploymentRoot, { recursive: true, force: true });
  }
});

test('retries an immutable callback without running the conversation again', async () => {
  const received = [];
  const calls = [];
  const callback = await startCallback(received, [503, 204]);
  const deploymentRoot = await fixture(callback.address().port, [1]);
  let service = null;
  try {
    const runtime = await createRuntime(deploymentRoot, calls);
    service = createGatewayHttpServer({ runtime });
    const address = await service.listen();
    const payload = requestPayload(`http://localhost:${callback.address().port}/callback`, 'request-03');
    const body = JSON.stringify(payload);
    await fetch(`http://${address.address}:${address.port}/v1/turns`, { method: 'POST', headers: signedHeaders({ body, nonce: 'nonce-retry-123456', idempotencyKey: 'idem-03' }), body });
    assert.equal(await waitUntil(() => received.length === 1), true);
    await new Promise((resolve) => setTimeout(resolve, 1_050));
    await runGatewayWork(runtime);
    assert.equal(await waitUntil(() => received.length === 2), true);
    const [record] = await listGatewayCallbacks(runtime.store);
    assert.equal(record.status, 'delivered');
    assert.equal(calls.length, 1);
    assert.deepEqual(received[0].body, received[1].body);
  } finally {
    if (service) await service.close();
    await new Promise((resolve) => callback.close(resolve));
    await rm(deploymentRoot, { recursive: true, force: true });
  }
});

test('binds source expansion to its caller and removes internal source language metadata', async () => {
  const deploymentRoot = await fixture();
  try {
    const runtime = await createRuntime(deploymentRoot, []);
    const caller = findCaller(runtime.configuration, 'webchat');
    const request = requestPayload('https://example.test/callback', 'request-04');
    const accepted = await acceptGatewayJob(runtime.store, { request, idempotencyKey: 'idem-04', requestHash: 'a'.repeat(64), caller });
    const job = await claimNextGatewayJob(runtime.store);
    const complete = await completeGatewayJob(runtime.store, { job, turn: { turnId: 'turn-04', language: 'en', text: 'Approved answer.', completedAt: new Date().toISOString() }, sourceEvidence: [{ title: 'Approved Guide', language: 'en', section: 'Overview', page: 1, excerpt: 'Approved source excerpt.' }], caller });
    const result = await getGatewaySourceExpansion(runtime.store, { callerId: 'webchat', token: complete.outbox.payload.sources.expansionToken });
    assert.deepEqual(result.sources, [{ title: 'Approved Guide', section: 'Overview', page: 1, excerpt: 'Approved source excerpt.' }]);
    await assert.rejects(() => getGatewaySourceExpansion(runtime.store, { callerId: 'other-terminal', token: complete.outbox.payload.sources.expansionToken }), { code: 'GATEWAY_SOURCE_EXPANSION_UNAVAILABLE' });
    assert.equal(accepted.duplicate, false);
  } finally {
    await rm(deploymentRoot, { recursive: true, force: true });
  }
});
