import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { deepFreeze } from '../core/deep-freeze.js';
import { FoundationError } from '../core/foundation-error.js';

export const CORE_CONFIGURATION_FILES = Object.freeze({
  assistant: 'assistant.json',
  runtime: 'runtime.json',
  conversationRuntime: 'conversation-runtime.json',
  chatMemory: 'chat-memory.json',
  gateway: 'gateway.json',
  knowledgePolicy: 'knowledge-policy.json',
  knowledgeAdministration: 'knowledge-administration.json',
  aiProviders: 'ai-providers.json',
  aiProviderLanes: 'ai-provider-lanes.json',
  aiCapabilityRoutes: 'ai-capability-routes.json',
  registeredCallers: 'registered-callers.json',
  observability: 'observability.json',
  whiteLabelBoundary: 'white-label-boundary.json'
});

const PURPOSES = new Set(['support', 'advisor', 'seller', 'onboarding', 'internal_knowledge']);
const ENVIRONMENTS = new Set(['development', 'test', 'production']);
const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const PROVIDER_KINDS = new Set(['openrouter', 'ollama_cloud', 'google_gemini', 'deterministic']);
const CAPABILITY = 'conversation_generation';

function assertObject(value, label) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new FoundationError(`${label} must be an object.`, { path: label });
  }
}

function assertExactKeys(value, allowed, label) {
  assertObject(value, label);
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new FoundationError(`${label} contains unsupported properties: ${unexpected.join(', ')}.`, { path: label });
  }
}

function assertString(value, label, { pattern, min = 1, max = 1000 } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max || (pattern && !pattern.test(value))) {
    throw new FoundationError(`${label} is invalid.`, { path: label });
  }
}

function assertInteger(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new FoundationError(`${label} must be an integer between ${min} and ${max}.`, { path: label });
  }
}

function assertSchemaVersion(value, label) {
  if (value.schemaVersion !== 1) {
    throw new FoundationError(`${label}.schemaVersion must be 1.`, { path: label });
  }
}

function validateAssistant(assistant) {
  const label = 'assistant.json';
  assertExactKeys(assistant, ['schemaVersion', 'assistantId', 'displayName', 'purpose', 'supportedLanguages', 'tone', 'identity', 'scope', 'uncertaintyGuidance'], label);
  assertSchemaVersion(assistant, label);
  assertString(assistant.assistantId, `${label}.assistantId`, { pattern: /^[a-z][a-z0-9-]{2,63}$/, max: 64 });
  assertString(assistant.displayName, `${label}.displayName`, { max: 80 });
  if (!PURPOSES.has(assistant.purpose)) {
    throw new FoundationError(`${label}.purpose is not supported.`, { path: label });
  }
  if (!Array.isArray(assistant.supportedLanguages) || assistant.supportedLanguages.length === 0) {
    throw new FoundationError(`${label}.supportedLanguages must be a non-empty array.`, { path: label });
  }
  for (const language of assistant.supportedLanguages) {
    assertString(language, `${label}.supportedLanguages`, { pattern: /^[a-z]{2,3}(-[A-Z]{2})?$/, max: 8 });
  }
  if (new Set(assistant.supportedLanguages).size !== assistant.supportedLanguages.length) {
    throw new FoundationError(`${label}.supportedLanguages must not contain duplicates.`, { path: label });
  }
  assertString(assistant.tone, `${label}.tone`, { pattern: /^[a-z][a-z0-9_]{2,79}$/, max: 80 });
}

function validateRuntime(runtime) {
  const label = 'runtime.json';
  assertExactKeys(runtime, ['schemaVersion', 'environment', 'dataDirectory', 'memoryRetentionDays', 'maxMessageCharacters', 'logLevel'], label);
  assertSchemaVersion(runtime, label);
  if (!ENVIRONMENTS.has(runtime.environment)) {
    throw new FoundationError(`${label}.environment is not supported.`, { path: label });
  }
  assertString(runtime.dataDirectory, `${label}.dataDirectory`, { pattern: /^(?![\\/])(?!(?:.*\.\.)).+$/, max: 200 });
  assertInteger(runtime.memoryRetentionDays, `${label}.memoryRetentionDays`, 1, 3650);
  assertInteger(runtime.maxMessageCharacters, `${label}.maxMessageCharacters`, 1, 100000);
  if (!LOG_LEVELS.has(runtime.logLevel)) {
    throw new FoundationError(`${label}.logLevel is not supported.`, { path: label });
  }
}

function validateConversationRuntime(configuration) {
  const label = 'conversation-runtime.json';
  assertExactKeys(configuration, ['schemaVersion', 'maxRecentTurns', 'maxRecentTurnCharacters', 'maxEvidenceDocuments', 'maxEvidenceCharacters', 'maxContextCharacters', 'maxResponseCharacters', 'temperature'], label);
  assertSchemaVersion(configuration, label);
  assertInteger(configuration.maxRecentTurns, `${label}.maxRecentTurns`, 1, 100);
  assertInteger(configuration.maxRecentTurnCharacters, `${label}.maxRecentTurnCharacters`, 100, 20000);
  assertInteger(configuration.maxEvidenceDocuments, `${label}.maxEvidenceDocuments`, 1, 20);
  assertInteger(configuration.maxEvidenceCharacters, `${label}.maxEvidenceCharacters`, 500, 50000);
  assertInteger(configuration.maxContextCharacters, `${label}.maxContextCharacters`, 1000, 100000);
  assertInteger(configuration.maxResponseCharacters, `${label}.maxResponseCharacters`, 100, 20000);
  if (typeof configuration.temperature !== 'number' || configuration.temperature < 0 || configuration.temperature > 2) throw new FoundationError(`${label}.temperature must be a number between 0 and 2.`, { path: label });
  if (configuration.maxContextCharacters < configuration.maxEvidenceCharacters) throw new FoundationError(`${label}.maxContextCharacters must accommodate the evidence budget.`, { path: label });
}
function validateChatMemory(configuration) {
  const label = 'chat-memory.json';
  assertExactKeys(configuration, ['schemaVersion', 'enabled', 'retentionDays', 'maxRecentTurns', 'maxRecentTurnCharacters', 'maxSummaryCharacters', 'maxChatFacts', 'storage', 'directory'], label);
  assertSchemaVersion(configuration, label);
  if (typeof configuration.enabled !== 'boolean' || configuration.storage !== 'file') throw new FoundationError(`${label} has an unsupported persistence configuration.`, { path: label });
  assertInteger(configuration.retentionDays, `${label}.retentionDays`, 1, 3650);
  assertInteger(configuration.maxRecentTurns, `${label}.maxRecentTurns`, 1, 100);
  assertInteger(configuration.maxRecentTurnCharacters, `${label}.maxRecentTurnCharacters`, 100, 20000);
  assertInteger(configuration.maxSummaryCharacters, `${label}.maxSummaryCharacters`, 0, 20000);
  assertInteger(configuration.maxChatFacts, `${label}.maxChatFacts`, 0, 100);
  assertString(configuration.directory, `${label}.directory`, { pattern: /^(?![\\/])(?!(?:.*\.\.)).+$/, max: 300 });
}
function validateGateway(configuration) {
  const label = 'gateway.json';
  assertExactKeys(configuration, ['schemaVersion', 'basePath', 'dataDirectory', 'maxRequestBytes', 'signatureMaxSkewSeconds', 'nonceRetentionSeconds', 'jobRetentionDays', 'callbackRetentionDays', 'sourceExpansionTokenTtlSeconds', 'maxWorkerConcurrency', 'maxCallbackResponseBytes', 'callbackTimeoutMs', 'callbackRetryDelaysSeconds', 'technicalUnavailableMessages'], label);
  assertSchemaVersion(configuration, label);
  if (configuration.basePath !== '/v1') throw new FoundationError(`${label}.basePath must be /v1.`, { path: label });
  assertString(configuration.dataDirectory, `${label}.dataDirectory`, { pattern: /^(?![\\/])(?!(?:.*\.\.)).+$/, max: 300 });
  for (const field of ['maxRequestBytes', 'signatureMaxSkewSeconds', 'nonceRetentionSeconds', 'jobRetentionDays', 'callbackRetentionDays', 'sourceExpansionTokenTtlSeconds', 'maxWorkerConcurrency', 'maxCallbackResponseBytes', 'callbackTimeoutMs']) assertInteger(configuration[field], `${label}.${field}`, field === 'maxCallbackResponseBytes' ? 0 : 1, field === 'maxWorkerConcurrency' ? 32 : 1_000_000);
  if (!Array.isArray(configuration.callbackRetryDelaysSeconds) || configuration.callbackRetryDelaysSeconds.length < 1 || configuration.callbackRetryDelaysSeconds.length > 10 || new Set(configuration.callbackRetryDelaysSeconds).size !== configuration.callbackRetryDelaysSeconds.length) throw new FoundationError(`${label}.callbackRetryDelaysSeconds is invalid.`, { path: label });
  for (const delay of configuration.callbackRetryDelaysSeconds) assertInteger(delay, `${label}.callbackRetryDelaysSeconds`, 1, 86400);
  assertExactKeys(configuration.technicalUnavailableMessages, ['en', 'es'], `${label}.technicalUnavailableMessages`);
  for (const language of ['en', 'es']) assertString(configuration.technicalUnavailableMessages[language], `${label}.technicalUnavailableMessages.${language}`, { max: 1000 });
}
function validateKnowledgePolicy(policy) {
  const label = 'knowledge-policy.json';
  assertExactKeys(policy, ['schemaVersion', 'approvedOnly', 'rawSourceRuntimeAccess', 'sourceVisibility', 'supportHistoryMode'], label);
  assertSchemaVersion(policy, label);
  if (policy.approvedOnly !== true || policy.rawSourceRuntimeAccess !== false) {
    throw new FoundationError(`${label} must enforce approved-only retrieval and deny raw source access.`, { path: label });
  }
  if (policy.sourceVisibility !== 'on_demand' || policy.supportHistoryMode !== 'admin_only') {
    throw new FoundationError(`${label} must retain the approved source policy.`, { path: label });
  }
}

function validateKnowledgeAdministration(configuration) {
  const label = 'knowledge-administration.json';
  assertExactKeys(configuration, ['schemaVersion', 'sourcesDirectory', 'registryPath', 'extractedDirectory', 'draftsDirectory', 'approvedDirectory', 'indexesDirectory', 'evaluationsDirectory', 'maxSourceFileBytes', 'maxSourceDirectoryDepth', 'maxSourceFiles', 'maxExtractionTextCharacters', 'maxExtractionSegments', 'requireHumanApproval', 'allowSymlinks'], label);
  assertSchemaVersion(configuration, label);
  const paths = ['sourcesDirectory', 'registryPath', 'extractedDirectory', 'draftsDirectory', 'approvedDirectory', 'indexesDirectory', 'evaluationsDirectory'];
  for (const field of paths) assertString(configuration[field], `${label}.${field}`, { pattern: /^(?![\\/])(?!(?:.*\.\.)).+$/, max: 300 });
  if (new Set(paths.map((field) => configuration[field])).size !== paths.length) throw new FoundationError(`${label} paths must be distinct.`, { path: label });
  assertInteger(configuration.maxSourceFileBytes, `${label}.maxSourceFileBytes`, 1024, 100000000);
  assertInteger(configuration.maxSourceDirectoryDepth, `${label}.maxSourceDirectoryDepth`, 0, 20);
  assertInteger(configuration.maxSourceFiles, `${label}.maxSourceFiles`, 1, 100000);
  assertInteger(configuration.maxExtractionTextCharacters, `${label}.maxExtractionTextCharacters`, 1000, 10000000);
  assertInteger(configuration.maxExtractionSegments, `${label}.maxExtractionSegments`, 1, 100000);
  if (configuration.requireHumanApproval !== true || configuration.allowSymlinks !== false) throw new FoundationError(`${label} must require human approval and deny symlinks.`, { path: label });
}
function validateObservability(observability) {
  const label = 'observability.json';
  assertExactKeys(observability, ['schemaVersion', 'redactionEnabled', 'includeMessageContent', 'maxEventDetailsCharacters'], label);
  assertSchemaVersion(observability, label);
  if (observability.redactionEnabled !== true || observability.includeMessageContent !== false) {
    throw new FoundationError(`${label} must enable redaction and deny raw message content.`, { path: label });
  }
  assertInteger(observability.maxEventDetailsCharacters, `${label}.maxEventDetailsCharacters`, 64, 100000);
}
function validateWhiteLabelBoundary(boundary) {
  const label = 'white-label-boundary.json';
  assertExactKeys(boundary, ['schemaVersion', 'disallowedCoreTerms', 'disallowedCorePathFragments'], label);
  assertSchemaVersion(boundary, label);
  for (const field of ['disallowedCoreTerms', 'disallowedCorePathFragments']) {
    if (!Array.isArray(boundary[field]) || boundary[field].length === 0 || new Set(boundary[field]).size !== boundary[field].length) {
      throw new FoundationError(`${label}.${field} must be a non-empty unique array.`, { path: label });
    }
    for (const value of boundary[field]) assertString(value, `${label}.${field}`, { max: 300 });
  }
}
function validateAiProviders(configuration) {
  const label = 'ai-providers.json';
  assertExactKeys(configuration, ['schemaVersion', 'providers'], label);
  assertSchemaVersion(configuration, label);
  if (!Array.isArray(configuration.providers)) throw new FoundationError(`${label}.providers must be an array.`, { path: label });
  const ids = new Set();
  for (const provider of configuration.providers) {
    assertExactKeys(provider, ['id', 'kind', 'enabled', 'supportedCapabilities'], `${label}.providers[]`);
    assertString(provider.id, `${label}.providers[].id`, { pattern: /^[a-z][a-z0-9-]{2,63}$/, max: 64 });
    if (ids.has(provider.id)) throw new FoundationError(`${label} has duplicate provider ID ${provider.id}.`, { path: label });
    ids.add(provider.id);
    if (!PROVIDER_KINDS.has(provider.kind)) throw new FoundationError(`${label}.providers[].kind is not supported.`, { path: label });
    if (typeof provider.enabled !== 'boolean') throw new FoundationError(`${label}.providers[].enabled must be boolean.`, { path: label });
    if (!Array.isArray(provider.supportedCapabilities) || provider.supportedCapabilities.length === 0 || new Set(provider.supportedCapabilities).size !== provider.supportedCapabilities.length || !provider.supportedCapabilities.every((capability) => capability === CAPABILITY)) {
      throw new FoundationError(`${label}.providers[].supportedCapabilities must contain only ${CAPABILITY}.`, { path: label });
    }
  }
}

function validateAiProviderLanes(configuration, providers) {
  const label = 'ai-provider-lanes.json';
  assertExactKeys(configuration, ['schemaVersion', 'lanes'], label);
  assertSchemaVersion(configuration, label);
  if (!Array.isArray(configuration.lanes)) throw new FoundationError(`${label}.lanes must be an array.`, { path: label });
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  const ids = new Set();
  for (const lane of configuration.lanes) {
    assertExactKeys(lane, ['id', 'capability', 'providerId', 'model', 'secretEnv', 'qualificationRecordId', 'geminiThinkingLevel', 'enabled', 'timeoutMs', 'maxInputCharacters', 'maxOutputCharacters', 'maxAttempts', 'retryBackoffMs'], `${label}.lanes[]`);
    assertString(lane.id, `${label}.lanes[].id`, { pattern: /^[a-z][a-z0-9-]{2,63}$/, max: 64 });
    if (ids.has(lane.id)) throw new FoundationError(`${label} has duplicate lane ID ${lane.id}.`, { path: label });
    ids.add(lane.id);
    if (lane.capability !== CAPABILITY) throw new FoundationError(`${label}.lanes[].capability must be ${CAPABILITY}.`, { path: label });
    assertString(lane.providerId, `${label}.lanes[].providerId`, { pattern: /^[a-z][a-z0-9-]{2,63}$/, max: 64 });
    const provider = providerById.get(lane.providerId);
    if (!provider || !provider.supportedCapabilities.includes(CAPABILITY)) throw new FoundationError(`${label}.lanes[] references a provider without ${CAPABILITY}.`, { path: label });
    assertString(lane.model, `${label}.lanes[].model`, { max: 200 });
    if (lane.secretEnv === null) {
      if (provider.kind !== 'deterministic') throw new FoundationError(`${label}.lanes[].secretEnv is required for network providers.`, { path: label });
    } else {
      assertString(lane.secretEnv, `${label}.lanes[].secretEnv`, { pattern: /^[A-Z][A-Z0-9_]{2,127}$/, max: 128 });
    }
    if (lane.qualificationRecordId !== null) assertString(lane.qualificationRecordId, `${label}.lanes[].qualificationRecordId`, { pattern: /^[a-z][a-z0-9-]{2,127}$/, max: 128 });
    if (lane.geminiThinkingLevel !== null && !['minimal', 'low', 'medium', 'high'].includes(lane.geminiThinkingLevel)) throw new FoundationError(`${label}.lanes[].geminiThinkingLevel is invalid.`, { path: label });
    if (lane.geminiThinkingLevel !== null && provider.kind !== 'google_gemini') throw new FoundationError(`${label}.lanes[].geminiThinkingLevel is only valid for Google Gemini lanes.`, { path: label });
    if (typeof lane.enabled !== 'boolean') throw new FoundationError(`${label}.lanes[].enabled must be boolean.`, { path: label });
    if (lane.enabled && provider.kind !== 'deterministic' && lane.qualificationRecordId === null) throw new FoundationError(`${label}.lanes[].qualificationRecordId is required for enabled network lanes.`, { path: label });
    assertInteger(lane.timeoutMs, `${label}.lanes[].timeoutMs`, 1000, 300000);
    assertInteger(lane.maxInputCharacters, `${label}.lanes[].maxInputCharacters`, 1, 1000000);
    assertInteger(lane.maxOutputCharacters, `${label}.lanes[].maxOutputCharacters`, 1, 100000);
    assertInteger(lane.maxAttempts, `${label}.lanes[].maxAttempts`, 1, 3);
    assertInteger(lane.retryBackoffMs, `${label}.lanes[].retryBackoffMs`, 0, 30000);
  }
}

function validateAiCapabilityRoutes(configuration, lanes) {
  const label = 'ai-capability-routes.json';
  assertExactKeys(configuration, ['schemaVersion', 'routes'], label);
  assertSchemaVersion(configuration, label);
  if (!Array.isArray(configuration.routes) || configuration.routes.length > 1) throw new FoundationError(`${label}.routes must contain zero or one ${CAPABILITY} route.`, { path: label });
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
  for (const route of configuration.routes) {
    assertExactKeys(route, ['capability', 'primaryLaneId', 'maxOperationMs', 'fallbackLaneIds'], `${label}.routes[]`);
    if (route.capability !== CAPABILITY) throw new FoundationError(`${label}.routes[].capability must be ${CAPABILITY}.`, { path: label });
    assertString(route.primaryLaneId, `${label}.routes[].primaryLaneId`, { pattern: /^[a-z][a-z0-9-]{2,63}$/, max: 64 });
    assertInteger(route.maxOperationMs, `${label}.routes[].maxOperationMs`, 1000, 900000);
    if (!Array.isArray(route.fallbackLaneIds) || new Set(route.fallbackLaneIds).size !== route.fallbackLaneIds.length || route.fallbackLaneIds.includes(route.primaryLaneId)) throw new FoundationError(`${label}.routes[].fallbackLaneIds is invalid.`, { path: label });
    for (const laneId of [route.primaryLaneId, ...route.fallbackLaneIds]) {
      const lane = laneById.get(laneId);
      if (!lane || lane.capability !== CAPABILITY) throw new FoundationError(`${label} references an invalid capability lane.`, { path: label });
    }
  }
}
function validateRegisteredCallers(registeredCallers, environment) {
  const label = 'registered-callers.json';
  assertExactKeys(registeredCallers, ['schemaVersion', 'callers'], label);
  assertSchemaVersion(registeredCallers, label);
  if (!Array.isArray(registeredCallers.callers)) {
    throw new FoundationError(`${label}.callers must be an array.`, { path: label });
  }
  const ids = new Set();
  for (const caller of registeredCallers.callers) {
    assertExactKeys(caller, ['schemaVersion', 'callerId', 'enabled', 'inboundSecretEnv', 'outboundSigningSecretEnv', 'callbackAllowlist', 'allowHttpLocalDevelopment', 'maxRequestBytes', 'maxMessageCharacters', 'maxPendingJobs', 'maxCallbackAttempts', 'sourceExpansionEnabled'], `${label}.callers[]`);
    assertSchemaVersion(caller, `${label}.callers[]`);
    assertString(caller.callerId, `${label}.callers[].callerId`, { pattern: /^[a-z][a-z0-9-]{2,63}$/, max: 64 });
    if (ids.has(caller.callerId)) {
      throw new FoundationError(`${label} has duplicate caller ID ${caller.callerId}.`, { path: label });
    }
    ids.add(caller.callerId);
    assertString(caller.inboundSecretEnv, `${label}.callers[].inboundSecretEnv`, { pattern: /^[A-Z][A-Z0-9_]{2,127}$/, max: 128 });
    assertString(caller.outboundSigningSecretEnv, `${label}.callers[].outboundSigningSecretEnv`, { pattern: /^[A-Z][A-Z0-9_]{2,127}$/, max: 128 });
    if (typeof caller.enabled !== 'boolean' || typeof caller.allowHttpLocalDevelopment !== 'boolean' || typeof caller.sourceExpansionEnabled !== 'boolean') throw new FoundationError(`${label}.callers[] boolean fields are invalid.`, { path: label });
    if (!Array.isArray(caller.callbackAllowlist) || caller.callbackAllowlist.length === 0) {
      throw new FoundationError(`${label}.callers[].callbackAllowlist must be non-empty.`, { path: label });
    }
    for (const rule of caller.callbackAllowlist) {
      assertExactKeys(rule, ['hostname', 'pathPrefix', 'port'], `${label}.callers[].callbackAllowlist[]`);
      assertString(rule.hostname, `${label}.callers[].callbackAllowlist[].hostname`, { pattern: /^(?:localhost|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/i, max: 253 });
      assertString(rule.pathPrefix, `${label}.callers[].callbackAllowlist[].pathPrefix`, { pattern: /^\/[A-Za-z0-9._~!$&'()*+,;=:@/%-]*$/, max: 500 });
      if (rule.port !== null) assertInteger(rule.port, `${label}.callers[].callbackAllowlist[].port`, 1, 65535);
      if (environment === 'production' && rule.hostname === 'localhost') {
        throw new FoundationError(`${label} cannot allow localhost in production.`, { path: label });
      }
    }
    assertInteger(caller.maxMessageCharacters, `${label}.callers[].maxMessageCharacters`, 1, 100000);
    assertInteger(caller.maxRequestBytes, `${label}.callers[].maxRequestBytes`, 1024, 1000000);
    assertInteger(caller.maxPendingJobs, `${label}.callers[].maxPendingJobs`, 1, 100000);
    assertInteger(caller.maxCallbackAttempts, `${label}.callers[].maxCallbackAttempts`, 1, 10);
    if (caller.maxMessageCharacters > caller.maxRequestBytes) throw new FoundationError(`${label}.callers[].maxMessageCharacters exceeds maxRequestBytes.`, { path: label });
  }
}

async function readStrictJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new FoundationError(`Cannot read strict JSON file ${filePath}.`, {
      code: 'CONFIG_INVALID_JSON',
      path: filePath,
      cause: error
    });
  }
}

export function validateCoreConfiguration(configuration) {
  assertObject(configuration, 'Core configuration');
  assertExactKeys(configuration, Object.keys(CORE_CONFIGURATION_FILES), 'Core configuration');
  validateAssistant(configuration.assistant);
  validateRuntime(configuration.runtime);
  validateConversationRuntime(configuration.conversationRuntime);
  validateChatMemory(configuration.chatMemory);
  validateGateway(configuration.gateway);
  validateKnowledgePolicy(configuration.knowledgePolicy);
  validateKnowledgeAdministration(configuration.knowledgeAdministration);
  validateObservability(configuration.observability);
  validateWhiteLabelBoundary(configuration.whiteLabelBoundary);
  validateAiProviders(configuration.aiProviders);
  validateAiProviderLanes(configuration.aiProviderLanes, configuration.aiProviders.providers);
  validateAiCapabilityRoutes(configuration.aiCapabilityRoutes, configuration.aiProviderLanes.lanes);
  validateRegisteredCallers(configuration.registeredCallers, configuration.runtime.environment);
  return deepFreeze(configuration);
}

export async function loadCoreConfiguration({ configDirectory }) {
  const configuration = {};
  for (const [key, fileName] of Object.entries(CORE_CONFIGURATION_FILES)) {
    configuration[key] = await readStrictJson(path.join(configDirectory, fileName));
  }
  return validateCoreConfiguration(configuration);
}
