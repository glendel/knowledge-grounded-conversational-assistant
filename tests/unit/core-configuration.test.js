import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadCoreConfiguration, validateCoreConfiguration } from '../../src/config/core-configuration.js';
import { createSyntheticCoreConfiguration, writeSyntheticCoreConfiguration } from '../fixtures/core-configuration.js';

test('loads and freezes an explicitly supplied synthetic configuration directory', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'kgca-core-config-'));
  try {
    const source = await writeSyntheticCoreConfiguration(directory);
    const configuration = await loadCoreConfiguration({ configDirectory: directory });
    assert.equal(configuration.assistant.assistantId, source.assistant.assistantId);
    assert.equal(Object.isFrozen(configuration), true);
    assert.equal(Object.isFrozen(configuration.aiProviders.providers), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects a network lane without qualification evidence and a weakened knowledge policy', () => {
  const missingQualification = createSyntheticCoreConfiguration();
  missingQualification.aiProviders.providers.push({ id: 'network-provider', kind: 'openrouter', enabled: true, supportedCapabilities: ['conversation_generation'] });
  missingQualification.aiProviderLanes.lanes.push({ id: 'network-lane', capability: 'conversation_generation', providerId: 'network-provider', model: 'configured-later', secretEnv: 'EXAMPLE_PROVIDER_KEY', qualificationRecordId: null, reasoning: null, geminiThinkingLevel: null, enabled: true, timeoutMs: 30000, maxInputCharacters: 5000, maxOutputCharacters: 1000, maxAttempts: 1, retryBackoffMs: 0 });
  assert.throws(() => validateCoreConfiguration(missingQualification), /required for enabled network lanes/);

  const weakenedKnowledgePolicy = createSyntheticCoreConfiguration();
  weakenedKnowledgePolicy.knowledgePolicy.rawSourceRuntimeAccess = true;
  assert.throws(() => validateCoreConfiguration(weakenedKnowledgePolicy), /approved-only retrieval/);
});
