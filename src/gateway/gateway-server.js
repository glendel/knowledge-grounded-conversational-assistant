import { createServer } from 'node:http';

import { validateContractInstance } from '../contracts/contract-registry.js';
import { FoundationError } from '../core/foundation-error.js';
import { assertSafeDeliveryTarget, validateCallbackUrl, validateInboundSecurity } from './gateway-security.js';
import { acceptGatewayJob, consumeGatewayNonce } from './gateway-store.js';
import { assessGatewayReadiness, expandGatewaySources, findCaller, readSecret, runGatewayWork } from './gateway-runtime.js';

export function createGatewayHttpServer({ runtime, environment = runtime?.environment, onAccepted = null } = {}) {
  if (!runtime) throw new FoundationError('Gateway runtime is required.', { code: 'GATEWAY_SERVER_DEPENDENCY_MISSING' });
  const server = createServer((request, response) => handleGatewayRequest({ request, response, runtime, environment, onAccepted }).catch((error) => sendError(response, runtime.contracts, error)));
  return Object.freeze({
    server,
    listen: ({ host = '127.0.0.1', port = 0 } = {}) => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(server.address()); }); }),
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  });
}

export async function handleGatewayRequest({ request, response, runtime, environment = runtime.environment, onAccepted = null }) {
  const url = new URL(request.url ?? '/', 'http://gateway.local');
  if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { schemaVersion: 1, status: 'ok' });
  if (request.method === 'GET' && url.pathname === '/ready') {
    const readiness = assessGatewayReadiness(runtime);
    return sendJson(response, readiness.ready ? 200 : 503, { schemaVersion: 1, status: readiness.ready ? 'ready' : 'not_ready' });
  }
  if (request.method !== 'POST' || !['/v1/turns', '/v1/source-expansions'].includes(url.pathname)) throw new FoundationError('Gateway endpoint is not found.', { code: 'GATEWAY_NOT_FOUND' });
  const rawBody = await readJsonBody(request, runtime.configuration.gateway.maxRequestBytes);
  const payload = parseJson(rawBody);
  if (url.pathname === '/v1/turns') return acceptTurn({ request, response, rawBody, payload, runtime, environment, onAccepted });
  return expandSources({ request, response, rawBody, payload, runtime, environment });
}

async function acceptTurn({ request, response, rawBody, payload, runtime, environment, onAccepted }) {
  assertContract(runtime.contracts, 'http-turn.contract.json', payload);
  const caller = findCaller(runtime.configuration, payload.callerId);
  if (Buffer.byteLength(rawBody) > caller.maxRequestBytes || payload.message.text.length > caller.maxMessageCharacters) throw new FoundationError('Gateway request limit is exceeded.', { code: 'GATEWAY_REQUEST_LIMIT' });
  const security = authenticate({ request, rawBody, pathname: '/v1/turns', caller, runtime, environment });
  await consumeGatewayNonce(runtime.store, { callerId: caller.callerId, nonce: security.nonce, expiresAt: addSeconds(runtime.now().toISOString(), runtime.configuration.gateway.nonceRetentionSeconds) });
  const target = validateCallbackUrl({ callbackUrl: payload.callbackUrl, caller, environment: runtime.configuration.runtime.environment });
  await assertSafeDeliveryTarget(target, { environment: runtime.configuration.runtime.environment });
  const accepted = await acceptGatewayJob(runtime.store, { request: payload, idempotencyKey: security.idempotencyKey, requestHash: security.requestHash, caller });
  assertContract(runtime.contracts, 'http-turn-ack.contract.json', accepted.acknowledgement);
  sendJson(response, 202, accepted.acknowledgement);
  if (!accepted.duplicate) queueMicrotask(() => Promise.resolve(onAccepted ? onAccepted(accepted.job) : runGatewayWork(runtime)).catch(() => undefined));
}

async function expandSources({ request, response, rawBody, payload, runtime, environment }) {
  assertContract(runtime.contracts, 'source-expansion-request.contract.json', payload);
  const caller = findCaller(runtime.configuration, payload.callerId);
  if (!caller.sourceExpansionEnabled) throw new FoundationError('Source expansion is disabled for this caller.', { code: 'GATEWAY_SOURCE_EXPANSION_UNAVAILABLE' });
  if (Buffer.byteLength(rawBody) > caller.maxRequestBytes) throw new FoundationError('Gateway request limit is exceeded.', { code: 'GATEWAY_REQUEST_LIMIT' });
  const security = authenticate({ request, rawBody, pathname: '/v1/source-expansions', caller, runtime, environment });
  await consumeGatewayNonce(runtime.store, { callerId: caller.callerId, nonce: security.nonce, expiresAt: addSeconds(runtime.now().toISOString(), runtime.configuration.gateway.nonceRetentionSeconds) });
  const result = await expandGatewaySources(runtime, { callerId: caller.callerId, token: payload.sourceAccessToken });
  assertContract(runtime.contracts, 'source-expansion-result.contract.json', result);
  sendJson(response, 200, result);
}

function authenticate({ request, rawBody, pathname, caller, runtime, environment }) { return validateInboundSecurity({ headers: request.headers, method: request.method, pathname, rawBody, secret: readSecret(environment, caller.inboundSecretEnv), now: runtime.now(), maxSkewSeconds: runtime.configuration.gateway.signatureMaxSkewSeconds }); }
async function readJsonBody(request, maximum) { const contentType = String(request.headers['content-type'] ?? '').toLowerCase().split(';')[0].trim(); if (contentType !== 'application/json') throw new FoundationError('Gateway content type is invalid.', { code: 'GATEWAY_CONTENT_TYPE_INVALID' }); const advertised = Number(request.headers['content-length'] ?? 0); if (Number.isFinite(advertised) && advertised > maximum) throw new FoundationError('Gateway body is too large.', { code: 'GATEWAY_BODY_TOO_LARGE' }); const chunks = []; let bytes = 0; for await (const chunk of request) { bytes += chunk.length; if (bytes > maximum) throw new FoundationError('Gateway body is too large.', { code: 'GATEWAY_BODY_TOO_LARGE' }); chunks.push(chunk); } if (!bytes) throw new FoundationError('Gateway request is empty.', { code: 'GATEWAY_REQUEST_INVALID' }); return Buffer.concat(chunks).toString('utf8'); }
function parseJson(raw) { try { return JSON.parse(raw); } catch { throw new FoundationError('Gateway JSON is invalid.', { code: 'GATEWAY_REQUEST_INVALID' }); } }
function assertContract(contracts, name, value) { const result = validateContractInstance(contracts[name], value); if (!result.valid) throw new FoundationError('Gateway request contract is invalid.', { code: 'GATEWAY_REQUEST_INVALID' }); }
function sendJson(response, status, value) { const body = JSON.stringify(value); response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' }); response.end(body); }
function sendError(response, contracts, error) { if (response.headersSent) return response.destroy(); const code = String(error?.code ?? 'GATEWAY_INTERNAL_ERROR'); const status = code === 'GATEWAY_NOT_FOUND' ? 404 : code === 'GATEWAY_BODY_TOO_LARGE' ? 413 : code === 'GATEWAY_QUEUE_LIMIT' ? 429 : code === 'GATEWAY_IDEMPOTENCY_CONFLICT' ? 409 : ['GATEWAY_CALLER_UNAUTHORIZED', 'GATEWAY_AUTH_INVALID', 'GATEWAY_TIMESTAMP_INVALID', 'GATEWAY_NONCE_REPLAY'].includes(code) ? 401 : code.startsWith('GATEWAY_') ? 400 : 500; const body = { schemaVersion: 1, error: { code, retryable: code === 'GATEWAY_QUEUE_LIMIT' || code === 'GATEWAY_SECRET_UNAVAILABLE' } }; const valid = validateContractInstance(contracts['gateway-error.contract.json'], body).valid; sendJson(response, valid ? status : 500, valid ? body : { schemaVersion: 1, error: { code: 'GATEWAY_INTERNAL_ERROR', retryable: false } }); }
function addSeconds(at, seconds) { return new Date(Date.parse(at) + seconds * 1000).toISOString(); }
