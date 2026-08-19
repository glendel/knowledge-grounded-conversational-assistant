import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createAiCapabilityRuntime } from '../../src/ai/ai-capability-runtime.js';
import { createCapabilityRouter } from '../../src/ai/capability-router.js';
import { validateCoreConfiguration } from '../../src/config/core-configuration.js';
import { loadContractRegistry } from '../../src/contracts/contract-registry.js';
import { createSyntheticCoreConfiguration } from '../fixtures/core-configuration.js';

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const now = () => new Date('2026-08-16T15:00:00Z');
const request = Object.freeze({ schemaVersion: 1, requestId: 'prose-request-01', capability: 'conversation_generation', requestedAt: '2026-08-16T15:00:00Z', messages: [{ role: 'user', content: 'Hola, ¿me puedes orientar?' }], generation: { languageHint: 'es', maxOutputCharacters: 500, temperature: null } });

async function contracts() {
  return loadContractRegistry({ contractsDirectory: path.join(coreRoot, 'context', 'contracts') });
}

function configuredDeterministicRuntime() {
  const configuration = createSyntheticCoreConfiguration();
  configuration.aiProviders.providers.push({ id: 'deterministic-provider', kind: 'deterministic', enabled: true, supportedCapabilities: ['conversation_generation'] });
  configuration.aiProviderLanes.lanes.push(
    { id: 'primary-prose', capability: 'conversation_generation', providerId: 'deterministic-provider', model: 'offline', secretEnv: null, qualificationRecordId: null, geminiThinkingLevel: null, enabled: true, timeoutMs: 30000, maxInputCharacters: 5000, maxOutputCharacters: 1000, maxAttempts: 1, retryBackoffMs: 0 },
    { id: 'fallback-prose', capability: 'conversation_generation', providerId: 'deterministic-provider', model: 'offline-fallback', secretEnv: null, qualificationRecordId: null, geminiThinkingLevel: null, enabled: true, timeoutMs: 30000, maxInputCharacters: 5000, maxOutputCharacters: 1000, maxAttempts: 1, retryBackoffMs: 0 }
  );
  configuration.aiCapabilityRoutes.routes.push({ capability: 'conversation_generation', primaryLaneId: 'primary-prose', maxOperationMs: 60000, fallbackLaneIds: ['fallback-prose'] });
  return validateCoreConfiguration(configuration);
}

test('capability router preserves normal prose and uses a configured fallback after a technical failure', async () => {
  let calls = 0;
  const router = createCapabilityRouter({
    configuration: configuredDeterministicRuntime(),
    contracts: await contracts(),
    now,
    adapters: {
      deterministic: async () => {
        calls += 1;
        if (calls === 1) throw new Error('temporary network failure');
        return { text: 'Claro. Cuéntame qué necesitas y lo revisamos paso a paso.', finishReason: 'stop', usage: null };
      }
    }
  });
  const outcome = await router.execute(request);
  assert.equal(outcome.status, 'success');
  assert.equal(outcome.result.laneId, 'fallback-prose');
  assert.equal(outcome.result.text, 'Claro. Cuéntame qué necesitas y lo revisamos paso a paso.');
});

test('capability router rejects internal reasoning and uses the configured fallback prose lane', async () => {
  const configuration = createSyntheticCoreConfiguration();
  configuration.aiProviders.providers.push({ id: 'deterministic-provider', kind: 'deterministic', enabled: true, supportedCapabilities: ['conversation_generation'] });
  configuration.aiProviderLanes.lanes = [
    { id: 'primary-prose', capability: 'conversation_generation', providerId: 'deterministic-provider', model: 'primary', secretEnv: null, qualificationRecordId: null, geminiThinkingLevel: null, enabled: true, timeoutMs: 30000, maxInputCharacters: 5000, maxOutputCharacters: 1000, maxAttempts: 1, retryBackoffMs: 0 },
    { id: 'fallback-prose', capability: 'conversation_generation', providerId: 'deterministic-provider', model: 'fallback', secretEnv: null, qualificationRecordId: null, geminiThinkingLevel: null, enabled: true, timeoutMs: 30000, maxInputCharacters: 5000, maxOutputCharacters: 1000, maxAttempts: 1, retryBackoffMs: 0 }
  ];
  configuration.aiCapabilityRoutes.routes.push({ capability: 'conversation_generation', primaryLaneId: 'primary-prose', maxOperationMs: 60000, fallbackLaneIds: ['fallback-prose'] });
  const observations = [];
  const runtime = createAiCapabilityRuntime({
    configuration: validateCoreConfiguration(configuration),
    contracts: await contracts(),
    observe: (event) => observations.push(event),
    adapters: {
      deterministic: async ({ lane }) => lane.id === 'primary-prose'
        ? { text: 'Okay, the user is asking for a plan. Let me analyze the request.', finishReason: 'stop', usage: null }
        : { text: 'Claro. Puedo ayudarte con esa pregunta.', finishReason: 'stop', usage: null }
    }
  });
  const outcome = await runtime.execute(request);
  assert.equal(outcome.status, 'success');
  assert.equal(outcome.result.laneId, 'fallback-prose');
  assert.ok(observations.some((event) => event.eventType === 'ai.prose.failed' && event.code === 'PROVIDER_INTERNAL_REASONING'));
});

test('network lanes do not execute without matching approved qualification evidence', async () => {
  const configuration = createSyntheticCoreConfiguration();
  configuration.aiProviders.providers.push({ id: 'network-provider', kind: 'openrouter', enabled: true, supportedCapabilities: ['conversation_generation'] });
  configuration.aiProviderLanes.lanes.push({ id: 'qualified-network', capability: 'conversation_generation', providerId: 'network-provider', model: 'configured-later', secretEnv: 'EXAMPLE_PROVIDER_KEY', qualificationRecordId: 'qualification-01', geminiThinkingLevel: null, enabled: true, timeoutMs: 30000, maxInputCharacters: 5000, maxOutputCharacters: 1000, maxAttempts: 1, retryBackoffMs: 0 });
  configuration.aiCapabilityRoutes.routes.push({ capability: 'conversation_generation', primaryLaneId: 'qualified-network', maxOperationMs: 60000, fallbackLaneIds: [] });
  const router = createCapabilityRouter({ configuration: validateCoreConfiguration(configuration), contracts: await contracts(), now, environment: { EXAMPLE_PROVIDER_KEY: 'synthetic-secret' }, adapters: { openrouter: async () => ({ text: 'Must not run.' }) } });
  const outcome = await router.execute(request);
  assert.equal(outcome.status, 'failure');
  assert.equal(outcome.failure.code, 'AI_MODEL_NOT_QUALIFIED');
});

test('injected capability runtime does not derive a deployment root', async () => {
  const runtime = createAiCapabilityRuntime({ configuration: configuredDeterministicRuntime(), contracts: await contracts(), now, adapters: { deterministic: async () => ({ text: 'Natural prose.', finishReason: 'stop', usage: null }) } });
  const outcome = await runtime.execute(request);
  assert.equal(outcome.status, 'success');
  assert.equal(outcome.result.text, 'Natural prose.');
});
