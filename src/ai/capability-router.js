import { FoundationError } from '../core/foundation-error.js';
import { validateContractInstance } from '../contracts/contract-registry.js';
import { ProviderTransportError, builtInProviderAdapters } from './provider-adapters.js';
import { isLaneQualified } from './model-qualification.js';
import { isInternalReasoning } from './prose-output-guard.js';

const CAPABILITY = 'conversation_generation';

function isoNow(now) { return now().toISOString(); }
function contractAssertion(contracts, name, value) {
  const result = validateContractInstance(contracts[name], value);
  if (!result.valid) throw new FoundationError(`${name} validation failed: ${result.failures.join('; ')}`, { code: 'AI_CONTRACT_INVALID' });
}
function failure({ requestId, laneId = null, code, category, retryable, attempt, now }) {
  return Object.freeze({ schemaVersion: 1, requestId, capability: CAPABILITY, laneId, code, category, retryable, safeMessage: 'The AI capability is temporarily unavailable.', attempt, occurredAt: isoNow(now) });
}
function totalInputLength(messages) { return messages.reduce((total, message) => total + message.content.length, 0); }

export function createCapabilityRouter({ configuration, contracts, adapters = builtInProviderAdapters, environment = process.env, fetchImpl = globalThis.fetch, qualificationRecords = [], allowUnqualifiedNetwork = false, now = () => new Date(), sleep = async () => {}, observe = () => {} }) {
  if (!configuration || !contracts) throw new TypeError('configuration and contracts are required.');
  const providers = new Map(configuration.aiProviders.providers.map((provider) => [provider.id, provider]));
  const lanes = new Map(configuration.aiProviderLanes.lanes.map((lane) => [lane.id, lane]));
  const route = configuration.aiCapabilityRoutes.routes.find((candidate) => candidate.capability === CAPABILITY) ?? null;

  async function execute(request) {
    contractAssertion(contracts, 'prose-generation-request.contract.json', request);
    if (!route) return { status: 'failure', result: null, failure: failure({ requestId: request.requestId, code: 'AI_ROUTE_NOT_CONFIGURED', category: 'configuration', retryable: false, attempt: 0, now }) };
    const candidates = [route.primaryLaneId, ...route.fallbackLaneIds];
    const operationDeadline = now().getTime() + route.maxOperationMs;
    let lastFailure = null;
    for (const laneId of candidates) {
      const remainingBeforeLane = operationDeadline - now().getTime();
      if (remainingBeforeLane <= 0) {
        lastFailure = failure({ requestId: request.requestId, laneId, code: 'AI_OPERATION_DEADLINE_EXCEEDED', category: 'timeout', retryable: false, attempt: 0, now });
        break;
      }
      const lane = lanes.get(laneId);
      const provider = lane ? providers.get(lane.providerId) : null;
      if (!lane || !provider || !lane.enabled || !provider.enabled) {
        lastFailure = failure({ requestId: request.requestId, laneId, code: 'AI_LANE_UNAVAILABLE', category: 'configuration', retryable: false, attempt: 0, now });
        continue;
      }
      if (totalInputLength(request.messages) > lane.maxInputCharacters || request.generation.maxOutputCharacters > lane.maxOutputCharacters) {
        lastFailure = failure({ requestId: request.requestId, laneId, code: 'AI_REQUEST_LIMIT_EXCEEDED', category: 'request_rejected', retryable: false, attempt: 0, now });
        continue;
      }
      const secret = lane.secretEnv === null ? null : environment[lane.secretEnv];
      if (lane.secretEnv !== null && (typeof secret !== 'string' || secret.length === 0)) {
        lastFailure = failure({ requestId: request.requestId, laneId, code: 'AI_CREDENTIAL_UNAVAILABLE', category: 'configuration', retryable: false, attempt: 0, now });
        continue;
      }
      if (!allowUnqualifiedNetwork && !isLaneQualified({ lane, provider, records: qualificationRecords })) {
        lastFailure = failure({ requestId: request.requestId, laneId, code: 'AI_MODEL_NOT_QUALIFIED', category: 'configuration', retryable: false, attempt: 0, now });
        continue;
      }
      const adapter = adapters[provider.kind];
      if (typeof adapter !== 'function') {
        lastFailure = failure({ requestId: request.requestId, laneId, code: 'AI_ADAPTER_UNAVAILABLE', category: 'configuration', retryable: false, attempt: 0, now });
        continue;
      }
      for (let attempt = 1; attempt <= lane.maxAttempts; attempt += 1) {
        const remainingBeforeAttempt = operationDeadline - now().getTime();
        if (remainingBeforeAttempt <= 0) {
          lastFailure = failure({ requestId: request.requestId, laneId: lane.id, code: 'AI_OPERATION_DEADLINE_EXCEEDED', category: 'timeout', retryable: false, attempt: attempt - 1, now });
          break;
        }
        try {
          const generated = await adapter({ request, lane: { ...lane, timeoutMs: Math.min(lane.timeoutMs, remainingBeforeAttempt) }, provider, secret, fetchImpl });
          if (now().getTime() > operationDeadline) throw new ProviderTransportError('Provider request exceeded the operation deadline.', { code: 'AI_OPERATION_DEADLINE_EXCEEDED', category: 'timeout', retryable: false });
          if (!generated || typeof generated.text !== 'string' || generated.text.trim().length === 0) throw new ProviderTransportError('Provider response did not contain normal prose.', { code: 'PROVIDER_INVALID_RESPONSE', category: 'invalid_response', retryable: false });
          if (generated.text.length > request.generation.maxOutputCharacters || generated.text.length > lane.maxOutputCharacters) throw new ProviderTransportError('Provider prose exceeded configured bounds.', { code: 'PROVIDER_OUTPUT_TOO_LARGE', category: 'invalid_response', retryable: false });
          if (isInternalReasoning(generated.text)) throw new ProviderTransportError('Provider response contained internal reasoning rather than user-facing prose.', { code: 'PROVIDER_INTERNAL_REASONING', category: 'invalid_response', retryable: true });
          const result = Object.freeze({ schemaVersion: 1, requestId: request.requestId, laneId: lane.id, providerId: provider.id, model: lane.model, text: generated.text, finishReason: generated.finishReason ?? null, usage: generated.usage ?? null, completedAt: isoNow(now) });
          contractAssertion(contracts, 'prose-generation-result.contract.json', result);
          observe({ eventType: 'ai.prose.completed', laneId: lane.id, providerId: provider.id, model: lane.model, attempt });
          return { status: 'success', result, failure: null };
        } catch (error) {
          const providerError = error instanceof ProviderTransportError ? error : new ProviderTransportError('Provider adapter failed.', { code: 'PROVIDER_UNAVAILABLE', category: 'unavailable', retryable: true, cause: error });
          const retryable = providerError.retryable || providerError.code === 'PROVIDER_INVALID_RESPONSE';
          lastFailure = failure({ requestId: request.requestId, laneId: lane.id, code: providerError.code, category: providerError.category, retryable, attempt, now });
          observe({ eventType: 'ai.prose.failed', laneId: lane.id, providerId: provider.id, code: providerError.code, category: providerError.category, attempt });
          if (!retryable || attempt === lane.maxAttempts) break;
          await sleep(lane.retryBackoffMs);
        }
      }
    }
    contractAssertion(contracts, 'ai-capability-failure.contract.json', lastFailure);
    return { status: 'failure', result: null, failure: lastFailure };
  }
  return Object.freeze({ execute });
}
