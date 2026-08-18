import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { FoundationError } from '../core/foundation-error.js';

export const GATEWAY_HEADERS = Object.freeze({ timestamp: 'x-kgca-timestamp', nonce: 'x-kgca-nonce', signature: 'x-kgca-signature', idempotencyKey: 'idempotency-key' });

export function sha256Hex(value) { return createHash('sha256').update(value).digest('hex'); }
export function createGatewayId(prefix) { return `${prefix}_${randomBytes(16).toString('hex')}`; }
export function createSourceExpansionToken() { return `expand_${randomBytes(32).toString('base64url')}`; }

export function scopedRuntimeId(callerId, externalId, kind) {
  if (!/^[a-z][a-z0-9-]{2,63}$/u.test(callerId) || typeof externalId !== 'string' || externalId.length < 1 || externalId.length > 128) {
    throw new FoundationError('Gateway scope identity is invalid.', { code: 'GATEWAY_SCOPE_INVALID' });
  }
  return `${kind}-${sha256Hex(`${callerId}\u0000${externalId}`).slice(0, 48)}`;
}

export function canonicalMacInput({ method, pathname, timestamp, nonce, idempotencyKey, rawBody }) {
  if (method !== 'POST' || !/^\/v1\/(?:turns|source-expansions)$/u.test(pathname)) {
    throw new FoundationError('Gateway request target is unsupported.', { code: 'GATEWAY_REQUEST_TARGET_INVALID' });
  }
  return `v1\n${method}\n${pathname}\n${timestamp}\n${nonce}\n${idempotencyKey}\n${sha256Hex(rawBody)}`;
}

export function signCanonicalMac({ secret, method, pathname, timestamp, nonce, idempotencyKey, rawBody }) {
  if (typeof secret !== 'string' || secret.length < 16) throw new FoundationError('Gateway signing secret is unavailable.', { code: 'GATEWAY_SECRET_UNAVAILABLE' });
  return `v1=${createHmac('sha256', secret).update(canonicalMacInput({ method, pathname, timestamp, nonce, idempotencyKey, rawBody })).digest('base64url')}`;
}

export function signCallbackPayload({ secret, callbackId, rawBody }) {
  if (typeof secret !== 'string' || secret.length < 16) throw new FoundationError('Gateway signing secret is unavailable.', { code: 'GATEWAY_SECRET_UNAVAILABLE' });
  if (!/^gatewaycallback_[a-f0-9]{32}$/u.test(callbackId)) throw new FoundationError('Gateway callback identity is invalid.', { code: 'GATEWAY_CALLBACK_INVALID' });
  return `v1=${createHmac('sha256', secret).update(`v1\nPOST\ncallback\n${callbackId}\n${sha256Hex(rawBody)}`).digest('base64url')}`;
}

export function verifyCanonicalMac(values) {
  if (typeof values.signature !== 'string' || !/^v1=[A-Za-z0-9_-]{43}$/u.test(values.signature)) return false;
  const expected = Buffer.from(signCanonicalMac(values));
  const actual = Buffer.from(values.signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validateInboundSecurity({ headers, method, pathname, rawBody, secret, now = new Date(), maxSkewSeconds }) {
  const timestamp = header(headers, GATEWAY_HEADERS.timestamp);
  const nonce = header(headers, GATEWAY_HEADERS.nonce);
  const signature = header(headers, GATEWAY_HEADERS.signature);
  const idempotencyKey = header(headers, GATEWAY_HEADERS.idempotencyKey);
  if (!timestamp || !nonce || !signature || !idempotencyKey || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(timestamp) || Number.isNaN(Date.parse(timestamp)) || !/^[A-Za-z0-9_-]{16,128}$/u.test(nonce) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u.test(idempotencyKey)) {
    throw new FoundationError('Gateway authentication headers are invalid.', { code: 'GATEWAY_AUTH_INVALID' });
  }
  if (Math.abs(now.getTime() - Date.parse(timestamp)) > maxSkewSeconds * 1000) throw new FoundationError('Gateway timestamp is outside its permitted window.', { code: 'GATEWAY_TIMESTAMP_INVALID' });
  if (!verifyCanonicalMac({ secret, signature, method, pathname, timestamp, nonce, idempotencyKey, rawBody })) throw new FoundationError('Gateway signature is invalid.', { code: 'GATEWAY_AUTH_INVALID' });
  return Object.freeze({ timestamp, nonce, idempotencyKey, requestHash: sha256Hex(rawBody) });
}

export function validateCallbackUrl({ callbackUrl, caller, environment }) {
  let url;
  try { url = new URL(callbackUrl); } catch { throw new FoundationError('Gateway callback URL is invalid.', { code: 'GATEWAY_CALLBACK_URL_INVALID' }); }
  if (url.username || url.password || url.hash || url.search || !url.pathname || isIP(url.hostname)) throw new FoundationError('Gateway callback URL is forbidden.', { code: 'GATEWAY_CALLBACK_URL_INVALID' });
  const local = url.hostname.toLowerCase() === 'localhost';
  const localException = environment !== 'production' && caller.allowHttpLocalDevelopment === true && local && url.protocol === 'http:';
  if (url.protocol !== 'https:' && !localException) throw new FoundationError('Gateway callback URL requires HTTPS.', { code: 'GATEWAY_CALLBACK_URL_INVALID' });
  const port = url.port ? Number(url.port) : null;
  const allowed = caller.callbackAllowlist.some((rule) => rule.hostname.toLowerCase() === url.hostname.toLowerCase() && pathMatchesPrefix(url.pathname, rule.pathPrefix) && rule.port === port);
  if (!allowed || (local && !localException)) throw new FoundationError('Gateway callback URL is not registered.', { code: 'GATEWAY_CALLBACK_URL_INVALID' });
  return Object.freeze({ url: url.toString(), hostname: url.hostname.toLowerCase(), pathname: url.pathname, port, isLocalDevelopment: localException });
}

export async function assertSafeDeliveryTarget(target, { environment }) {
  if (target.isLocalDevelopment) return Object.freeze({ ...target, address: '127.0.0.1', family: 4 });
  if (environment === 'production' && target.hostname === 'localhost') throw new FoundationError('Local callback is forbidden in production.', { code: 'GATEWAY_CALLBACK_URL_INVALID' });
  let addresses;
  try { addresses = await lookup(target.hostname, { all: true, verbatim: true }); } catch { throw new FoundationError('Gateway callback host cannot be resolved safely.', { code: 'GATEWAY_CALLBACK_TARGET_UNRESOLVED' }); }
  if (addresses.length === 0 || addresses.some((entry) => privateAddress(entry.address))) throw new FoundationError('Gateway callback target is not publicly routable.', { code: 'GATEWAY_CALLBACK_TARGET_FORBIDDEN' });
  return Object.freeze({ ...target, address: addresses[0].address, family: addresses[0].family });
}

function privateAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0 && c === 113);
  }
  const value = address.toLowerCase();
  return value === '::1' || value === '::' || value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('2001:db8:') || /^::ffff:(?:0:)?(?:127|10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\./u.test(value);
}

function pathMatchesPrefix(pathname, prefix) { return prefix === '/' || pathname === prefix || pathname.startsWith(`${prefix}/`); }
function header(headers, name) { const value = headers?.[name] ?? headers?.[name.toLowerCase()]; return Array.isArray(value) ? value[0] : value ?? null; }
