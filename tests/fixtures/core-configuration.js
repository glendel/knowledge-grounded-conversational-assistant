import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CORE_CONFIGURATION_FILES } from '../../src/config/core-configuration.js';

export function createSyntheticCoreConfiguration() {
  return {
    assistant: {
      schemaVersion: 1,
      assistantId: 'example-assistant',
      displayName: 'Example Assistant',
      purpose: 'support',
      supportedLanguages: ['en', 'es'],
      tone: 'natural_clear_polite',
      identity: 'You are the configured assistant.',
      scope: 'Use only approved knowledge for the configured purpose.',
      uncertaintyGuidance: 'State uncertainty naturally and suggest the configured handoff.'
    },
    runtime: { schemaVersion: 1, environment: 'test', dataDirectory: 'app/data', memoryRetentionDays: 7, maxMessageCharacters: 8000, logLevel: 'info' },
    conversationRuntime: { schemaVersion: 1, maxRecentTurns: 12, maxRecentTurnCharacters: 2000, maxEvidenceDocuments: 4, maxEvidenceCharacters: 8000, maxContextCharacters: 18000, maxResponseCharacters: 3000, temperature: 0.2, intelligence: { maxRetrievalHistoryMessages: 4, maxRelatedEvidenceDocuments: 2, maxContinuityCharacters: 3200, qualityReviewEnabled: false, qualityReviewMinimumEvidenceDocuments: 1 } },
    chatMemory: { schemaVersion: 1, enabled: true, retentionDays: 7, maxRecentTurns: 12, maxRecentTurnCharacters: 2000, maxSummaryCharacters: 2400, maxChatFacts: 12, storage: 'file', directory: 'app/data/chat-memory' },
    gateway: { schemaVersion: 1, basePath: '/v1', dataDirectory: 'app/data/gateway', maxRequestBytes: 32768, signatureMaxSkewSeconds: 300, nonceRetentionSeconds: 900, jobRetentionDays: 7, callbackRetentionDays: 7, sourceExpansionTokenTtlSeconds: 900, maxWorkerConcurrency: 2, maxCallbackResponseBytes: 4096, callbackTimeoutMs: 10000, callbackRetryDelaysSeconds: [5, 30, 120], technicalUnavailableMessages: { en: 'Temporarily unavailable.', es: 'Temporalmente no disponible.' } },
    knowledgePolicy: { schemaVersion: 1, approvedOnly: true, rawSourceRuntimeAccess: false, sourceVisibility: 'on_demand', supportHistoryMode: 'admin_only' },
    knowledgeAdministration: { schemaVersion: 1, sourcesDirectory: 'app/knowledge/sources', registryPath: 'app/knowledge/registry.json', extractedDirectory: 'app/knowledge/extracted', draftsDirectory: 'app/knowledge/drafts', approvedDirectory: 'app/knowledge/approved', indexesDirectory: 'app/knowledge/indexes', evaluationsDirectory: 'app/knowledge/evaluations', maxSourceFileBytes: 25000000, maxSourceDirectoryDepth: 4, maxSourceFiles: 1000, maxExtractionTextCharacters: 8000000, maxExtractionSegments: 25000, requireHumanApproval: true, allowSymlinks: false },
    aiProviders: { schemaVersion: 1, providers: [] },
    aiProviderLanes: { schemaVersion: 1, lanes: [] },
    aiCapabilityRoutes: { schemaVersion: 1, routes: [] },
    registeredCallers: { schemaVersion: 1, callers: [] },
    observability: { schemaVersion: 1, redactionEnabled: true, includeMessageContent: false, maxEventDetailsCharacters: 4096 },
    whiteLabelBoundary: { schemaVersion: 1, disallowedCoreTerms: ['example-business'], disallowedCorePathFragments: ['deployment/private-sources'] }
  };
}

export async function writeSyntheticCoreConfiguration(directory, configuration = createSyntheticCoreConfiguration()) {
  await mkdir(directory, { recursive: true });
  for (const [key, fileName] of Object.entries(CORE_CONFIGURATION_FILES)) {
    await writeFile(path.join(directory, fileName), `${JSON.stringify(configuration[key], null, 2)}\n`, 'utf8');
  }
  return configuration;
}
