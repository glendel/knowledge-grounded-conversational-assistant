import { createAiCapabilityRuntime } from '../ai/ai-capability-runtime.js';
import { validateContractInstance } from '../contracts/contract-registry.js';
import { createOpaqueId } from '../core/ids.js';
import { FoundationError } from '../core/foundation-error.js';
import { createApprovedKnowledgeRetriever, retrieveApprovedKnowledge } from './approved-knowledge-retriever.js';
import { assembleConversationContext } from './context-assembler.js';
import { normalizeUserMessage } from './message-normalizer.js';

export function createConversationRuntime({ descriptor, capabilityRuntime = null, qualificationRecords = [], environment = process.env, fetchImpl = globalThis.fetch, now = () => new Date(), observe = () => {} } = {}) {
  if (!descriptor?.configuration || !descriptor?.contracts) throw new TypeError('A validated deployment descriptor is required.');
  if (!Array.isArray(qualificationRecords)) throw new TypeError('qualificationRecords must be an array.');
  assertConversationCapacity(descriptor.configuration);
  const capability = capabilityRuntime ?? createAiCapabilityRuntime({
    configuration: descriptor.configuration,
    contracts: descriptor.contracts,
    qualificationRecords,
    environment,
    fetchImpl,
    now,
    observe
  });
  if (!capability || typeof capability.execute !== 'function') throw new TypeError('capabilityRuntime.execute is required.');
  return Object.freeze({
    descriptor,
    capability,
    retriever: createApprovedKnowledgeRetriever({ descriptor }),
    now,
    observe,
    sessions: new Map()
  });
}

export async function processConversationTurn(runtime, { conversationId, userId, message } = {}) {
  assertOpaqueIdentifier(conversationId, 'conversationId');
  assertOpaqueIdentifier(userId, 'userId');
  const normalized = normalizeUserMessage({
    message,
    supportedLanguages: runtime.descriptor.configuration.assistant.supportedLanguages,
    maximumCharacters: runtime.descriptor.configuration.runtime.maxMessageCharacters
  });
  const sessionKey = runtime.descriptor.configuration.assistant.assistantId + '\u0000' + conversationId + '\u0000' + userId;
  const session = runtime.sessions.get(sessionKey) ?? { turns: [] };
  const evidence = await retrieveApprovedKnowledge(runtime.retriever, { message: normalized.text });
  const context = assembleConversationContext({
    configuration: runtime.descriptor.configuration,
    conversationId,
    userId,
    language: normalized.language,
    message: normalized.text,
    evidence,
    recentTurns: session.turns
  });
  assertContract(runtime.descriptor.contracts, 'runtime-conversation-context.contract.json', context);
  const generated = await runtime.capability.execute({
    schemaVersion: 1,
    requestId: createOpaqueId('prose-request'),
    capability: 'conversation_generation',
    requestedAt: runtime.now().toISOString(),
    messages: context.messages,
    generation: {
      languageHint: normalized.language,
      maxOutputCharacters: runtime.descriptor.configuration.conversationRuntime.maxResponseCharacters,
      temperature: runtime.descriptor.configuration.conversationRuntime.temperature
    }
  });
  if (generated.status !== 'success') {
    runtime.observe({
      eventType: 'conversation.turn.unavailable',
      correlationId: generated.failure?.requestId ?? null,
      code: generated.failure?.code ?? 'AI_CAPABILITY_FAILURE',
      evidenceState: evidence.status,
      language: normalized.language
    });
    return Object.freeze({ status: 'technical_failure', turn: null, failure: generated.failure, context });
  }

  const text = validateVisibleProse(generated.result.text, runtime.descriptor.configuration.conversationRuntime.maxResponseCharacters);
  const completedAt = runtime.now().toISOString();
  const turn = Object.freeze({
    schemaVersion: 1,
    turnId: createOpaqueId('turn'),
    conversationId,
    userId,
    language: normalized.language,
    text,
    evidenceState: evidence.status,
    knowledgeVersion: evidence.knowledgeVersion,
    sourcesAvailable: evidence.status === 'evidence',
    completedAt
  });
  assertContract(runtime.descriptor.contracts, 'runtime-conversation-turn.contract.json', turn);
  session.turns = boundSessionTurns([...session.turns, { role: 'user', text: normalized.text }, { role: 'assistant', text }], runtime.descriptor.configuration.conversationRuntime);
  runtime.sessions.set(sessionKey, session);
  runtime.observe({
    eventType: 'conversation.turn.completed',
    correlationId: turn.turnId,
    evidenceState: evidence.status,
    sourceCount: evidence.candidates.length,
    language: normalized.language
  });
  return Object.freeze({ status: 'success', turn, failure: null, context });
}

function assertConversationCapacity(configuration) {
  const laneById = new Map(configuration.aiProviderLanes.lanes.map((lane) => [lane.id, lane]));
  for (const route of configuration.aiCapabilityRoutes.routes) {
    for (const laneId of [route.primaryLaneId, ...route.fallbackLaneIds]) {
      const lane = laneById.get(laneId);
      if (!lane || !lane.enabled) continue;
      if (lane.maxInputCharacters < configuration.conversationRuntime.maxContextCharacters || lane.maxOutputCharacters < configuration.conversationRuntime.maxResponseCharacters) {
        throw new FoundationError('Configured conversation lane cannot carry the context or response budget.', { code: 'RUNTIME_LANE_CAPACITY_INVALID', path: laneId });
      }
    }
  }
}

function assertOpaqueIdentifier(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 || [...value].some((character) => character.codePointAt(0) < 32)) {
    throw new FoundationError(label + ' must be an opaque bounded identifier.', { code: 'RUNTIME_IDENTIFIER_INVALID', path: label });
  }
}

function validateVisibleProse(value, maximumCharacters) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0 || text.length > maximumCharacters) {
    throw new FoundationError('Generated prose is empty or exceeds the configured limit.', { code: 'RUNTIME_PROSE_INVALID' });
  }
  if (/\[REDACTED_[A-Z_]+\]/u.test(text) || /(?:[a-z]:\\|\/app\/knowledge\/|\/config\/)/iu.test(text)) {
    throw new FoundationError('Generated prose exposed an internal persistence marker or path.', { code: 'RUNTIME_PROSE_BOUNDARY_REJECTED' });
  }
  if (/^(?:the user|el usuario)\s+(?:is asking|asks|wants|esta preguntando|pregunta|quiere)\b/iu.test(text)) {
    throw new FoundationError('Generated prose exposed internal request narration.', { code: 'RUNTIME_PROSE_BOUNDARY_REJECTED' });
  }
  return text;
}

function boundSessionTurns(turns, configuration) {
  return turns
    .slice(-(configuration.maxRecentTurns * 2))
    .map((turn) => Object.freeze({ role: turn.role, text: String(turn.text).slice(0, configuration.maxRecentTurnCharacters) }));
}

function assertContract(contracts, fileName, value) {
  const contract = contracts[fileName];
  if (!contract) throw new FoundationError('Required contract is unavailable: ' + fileName, { code: 'RUNTIME_CONTRACT_MISSING' });
  const result = validateContractInstance(contract, value);
  if (!result.valid) throw new FoundationError(fileName + ' validation failed: ' + result.failures.join('; '), { code: 'RUNTIME_CONTRACT_INVALID' });
}
