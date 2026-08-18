import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { isLaneQualified } from '../ai/model-qualification.js';
import { createConversationRuntime, processConversationTurn } from '../conversation/conversation-runtime.js';
import { retrieveApprovedKnowledge } from '../conversation/approved-knowledge-retriever.js';
import { loadDeploymentQualificationRecords } from '../deployment/provider-qualification-records.js';
import { FoundationError } from '../core/foundation-error.js';
import { assertSafeDeliveryTarget, scopedRuntimeId, signCallbackPayload, validateCallbackUrl } from './gateway-security.js';
import { claimDueGatewayCallback, claimNextGatewayJob, completeGatewayJob, createGatewayStore, getGatewaySourceExpansion, recordGatewayCallbackAttempt } from './gateway-store.js';

export async function createGatewayRuntime({ descriptor, environment = process.env, fetchImpl = globalThis.fetch, now = () => new Date(), observe = () => {}, conversationRuntime = null, qualificationRecords = null, conversationFactory = createConversationRuntime } = {}) {
  if (!descriptor?.deploymentRoot || !descriptor?.configuration || !descriptor?.contracts) throw new TypeError('A validated deployment descriptor is required.');
  const records = qualificationRecords ?? await loadDeploymentQualificationRecords({ descriptor });
  if (!Array.isArray(records)) throw new TypeError('qualificationRecords must be an array.');
  const conversation = conversationRuntime ?? conversationFactory({ descriptor, qualificationRecords: records, environment, fetchImpl, now, observe });
  if (conversation.descriptor !== descriptor) throw new TypeError('The injected conversation runtime must use the supplied deployment descriptor.');
  const store = createGatewayStore({ deploymentRoot: descriptor.deploymentRoot, configuration: descriptor.configuration, contracts: descriptor.contracts, now: () => now().toISOString() });
  return Object.freeze({ descriptor, environment, fetchImpl, now, observe, conversation, configuration: descriptor.configuration, contracts: descriptor.contracts, qualificationRecords: records, store });
}

export function assessGatewayReadiness(runtime) {
  const route = runtime?.configuration?.aiCapabilityRoutes?.routes.find((item) => item.capability === 'conversation_generation');
  if (!route) return Object.freeze({ ready: false });
  const providers = new Map(runtime.configuration.aiProviders.providers.map((item) => [item.id, item]));
  const lanes = new Map(runtime.configuration.aiProviderLanes.lanes.map((item) => [item.id, item]));
  const ready = [route.primaryLaneId, ...route.fallbackLaneIds].some((laneId) => {
    const lane = lanes.get(laneId);
    const provider = lane ? providers.get(lane.providerId) : null;
    const credentialAvailable = lane?.secretEnv === null || (typeof runtime.environment?.[lane?.secretEnv] === 'string' && runtime.environment[lane.secretEnv].length > 0);
    return Boolean(lane?.enabled && provider?.enabled && credentialAvailable && isLaneQualified({ lane, provider, records: runtime.qualificationRecords }));
  });
  return Object.freeze({ ready });
}

export function findCaller(configuration, callerId) {
  const caller = configuration.registeredCallers.callers.find((item) => item.callerId === callerId && item.enabled);
  if (!caller) throw new FoundationError('Caller is not registered.', { code: 'GATEWAY_CALLER_UNAUTHORIZED' });
  return caller;
}

export function readSecret(environment, key) {
  const value = environment?.[key];
  if (typeof value !== 'string' || value.length < 16) throw new FoundationError('Gateway secret is unavailable.', { code: 'GATEWAY_SECRET_UNAVAILABLE' });
  return value;
}

export async function runGatewayWork(runtime, { maximumJobs = runtime.configuration.gateway.maxWorkerConcurrency } = {}) {
  let completed = 0;
  for (let index = 0; index < maximumJobs; index += 1) {
    const job = await claimNextGatewayJob(runtime.store);
    if (!job) break;
    await runJob(runtime, job);
    completed += 1;
  }
  let delivered = 0;
  while (delivered < maximumJobs) {
    const callback = await claimDueGatewayCallback(runtime.store);
    if (!callback) break;
    await deliverCallback(runtime, callback);
    delivered += 1;
  }
  return Object.freeze({ completed, delivered });
}

export async function expandGatewaySources(runtime, { callerId, token }) { return getGatewaySourceExpansion(runtime.store, { callerId, token }); }

async function runJob(runtime, job) {
  const caller = findCaller(runtime.configuration, job.callerId);
  const request = job.request;
  const conversationId = scopedRuntimeId(caller.callerId, request.conversationId, 'conversation');
  const userId = scopedRuntimeId(caller.callerId, request.userId, 'user');
  try {
    const result = await processConversationTurn(runtime.conversation, { conversationId, userId, message: request.message.text });
    if (result.status === 'success') {
      const evidence = await retrieveApprovedKnowledge(runtime.conversation.retriever, { message: request.message.text });
      const sourceEvidence = evidence.candidates.map((item) => ({ title: item.title, language: item.language, section: null, page: null, excerpt: item.claims }));
      await completeGatewayJob(runtime.store, { job, turn: result.turn, sourceEvidence, caller });
      runtime.observe({ eventType: 'gateway.job.completed', correlationId: job.id, sourceCount: sourceEvidence.length });
      return;
    }
    await completeGatewayJob(runtime.store, { job, turn: unavailableTurn(runtime, result.context?.language), sourceEvidence: [], caller, safeFailure: true, failureCode: result.failure?.code });
    runtime.observe({ eventType: 'gateway.job.technical_failure', correlationId: job.id, code: result.failure?.code ?? 'RUNTIME_TECHNICAL_FAILURE' });
  } catch (error) {
    await completeGatewayJob(runtime.store, { job, turn: unavailableTurn(runtime), sourceEvidence: [], caller, safeFailure: true, failureCode: error?.code });
    runtime.observe({ eventType: 'gateway.job.unhandled_failure', correlationId: job.id, code: error?.code ?? 'GATEWAY_RUNTIME_FAILURE' });
  }
}

function unavailableTurn(runtime, language = null) {
  const selected = language && runtime.configuration.assistant.supportedLanguages.includes(language) ? language : runtime.configuration.assistant.supportedLanguages.includes('en') ? 'en' : runtime.configuration.assistant.supportedLanguages[0];
  const fallbackText = runtime.configuration.gateway.technicalUnavailableMessages[selected] ?? runtime.configuration.gateway.technicalUnavailableMessages.en;
  return { turnId: `gateway-unavailable-${runtime.now().getTime()}`, language: selected, text: fallbackText, completedAt: runtime.now().toISOString() };
}

async function deliverCallback(runtime, callback) {
  const caller = findCaller(runtime.configuration, callback.callerId);
  try {
    const target = validateCallbackUrl({ callbackUrl: callback.callbackUrl, caller, environment: runtime.configuration.runtime.environment });
    await assertSafeDeliveryTarget(target, { environment: runtime.configuration.runtime.environment });
    const rawBody = JSON.stringify(callback.payload);
    const response = await deliverPinnedCallback({ target, rawBody, callbackId: callback.id, secret: readSecret(runtime.environment, caller.outboundSigningSecretEnv), timeoutMs: runtime.configuration.gateway.callbackTimeoutMs, maxResponseBytes: runtime.configuration.gateway.maxCallbackResponseBytes });
    const delivered = response.statusCode >= 200 && response.statusCode < 300;
    await recordGatewayCallbackAttempt(runtime.store, { callback, delivered, statusCode: response.statusCode, failureCategory: delivered ? null : 'gateway.callback_non_success' });
    runtime.observe({ eventType: delivered ? 'gateway.callback.delivered' : 'gateway.callback.non_success', correlationId: callback.id, statusCode: response.statusCode });
  } catch (error) {
    const timeout = error?.name === 'AbortError' || error?.code === 'ETIMEDOUT';
    await recordGatewayCallbackAttempt(runtime.store, { callback, delivered: false, failureCategory: timeout ? 'gateway.callback_timeout' : 'gateway.callback_network_failure' });
    runtime.observe({ eventType: 'gateway.callback.delivery_failed', correlationId: callback.id, code: timeout ? 'GATEWAY_CALLBACK_TIMEOUT' : error?.code === 'ECONNREFUSED' ? 'GATEWAY_CALLBACK_CONNECTION_REFUSED' : 'GATEWAY_CALLBACK_NETWORK_FAILURE' });
  }
}

function deliverPinnedCallback({ target, rawBody, callbackId, secret, timeoutMs, maxResponseBytes }) {
  return new Promise((resolve, reject) => {
    const client = target.url.startsWith('https:') ? httpsRequest : httpRequest;
    const url = new URL(target.url);
    const request = client({ protocol: url.protocol, hostname: target.address, servername: target.hostname, port: target.port ?? undefined, path: target.pathname, method: 'POST', headers: { host: url.host, 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(rawBody), 'idempotency-key': callbackId, 'x-kgca-callback-id': callbackId, 'x-kgca-signature': signCallbackPayload({ secret, callbackId, rawBody }) }, timeout: timeoutMs }, (response) => {
      let bytes = 0;
      response.on('data', (chunk) => { bytes += chunk.length; if (bytes > maxResponseBytes) response.destroy(); });
      response.on('end', () => resolve({ statusCode: response.statusCode ?? 0 }));
      response.on('error', reject);
    });
    request.once('timeout', () => { const error = new Error('Gateway callback timed out.'); error.code = 'ETIMEDOUT'; request.destroy(error); });
    request.once('error', reject);
    request.end(rawBody);
  });
}
