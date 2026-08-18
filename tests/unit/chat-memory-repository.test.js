import assert from 'node:assert/strict';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { appendChatMemory, cleanupExpiredChatMemory, createChatMemoryRepository, loadChatMemory } from '../../src/memory/chat-memory-repository.js';
import { loadCoreConfiguration } from '../../src/config/core-configuration.js';
import { loadContractRegistry } from '../../src/contracts/contract-registry.js';
import { writeSyntheticCoreConfiguration } from '../fixtures/core-configuration.js';

const CORE_ROOT = path.resolve(import.meta.dirname, '..', '..');

async function fixtureRepository({ now } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kgca-chat-memory-'));
  await writeSyntheticCoreConfiguration(path.join(root, 'config'));
  await cp(path.join(CORE_ROOT, 'context'), path.join(root, 'context'), { recursive: true });
  const configuration = await loadCoreConfiguration({ configDirectory: path.join(root, 'config') });
  const contracts = await loadContractRegistry({ contractsDirectory: path.join(root, 'context', 'contracts') });
  return { root, repository: createChatMemoryRepository({ projectRoot: root, configuration, contracts, now }) };
}

test('persists isolated, redacted, bounded chat continuity with safe explicit facts', async () => {
  let current = new Date('2026-08-08T12:00:00.000Z');
  const { root, repository } = await fixtureRepository({ now: () => current });
  const scope = { assistantId: 'example-assistant', conversationId: 'conversation-01', userId: 'user-01' };
  try {
    await appendChatMemory(repository, { scope, userTurn: { id: 'memory-user-01', text: 'My name is Alex.' }, assistantTurn: { id: 'turn-01', text: 'Hello Alex.' } });
    await appendChatMemory(repository, { scope, userTurn: { id: 'memory-user-02', text: 'password=<placeholder>' }, assistantTurn: { id: 'turn-02', text: 'I received <placeholder>.' } });
    const first = await loadChatMemory(repository, scope);
    assert.equal(first.chatFacts.at(-1).value, 'Alex');
    assert.equal(first.recentTurns.some((turn) => turn.text.includes('<placeholder>')), false);
    assert.equal(await loadChatMemory(repository, { ...scope, userId: 'user-02' }), null);

    for (let index = 0; index < 13; index += 1) {
      await appendChatMemory(repository, { scope, userTurn: { id: `memory-user-${index + 10}`, text: `I need help ${index}.` }, assistantTurn: { id: `turn-${index + 10}`, text: `Reply ${index}.` } });
    }
    const compacted = await loadChatMemory(repository, scope);
    assert.equal(compacted.recentTurns.length, 24);
    assert.match(compacted.summary?.text ?? '', /User:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('omits whole sensitive turns, including facts and assistant echoes', async () => {
  const { root, repository } = await fixtureRepository({ now: () => new Date('2026-08-08T12:00:00.000Z') });
  const scope = { assistantId: 'example-assistant', conversationId: 'conversation-04', userId: 'user-01' };
  try {
    await appendChatMemory(repository, { scope, userTurn: { id: 'memory-user-41', text: 'My name is Morgan. Card 4111 1111 1111 1111.' }, assistantTurn: { id: 'turn-41', text: 'I received card 4111 1111 1111 1111.' } });
    await appendChatMemory(repository, { scope, userTurn: { id: 'memory-user-42', text: 'Código de verificación: 123456' }, assistantTurn: { id: 'turn-42', text: 'Your verification code is 123456.' } });
    const snapshot = await loadChatMemory(repository, scope);
    assert.equal(snapshot.recentTurns.length, 0);
    assert.equal(snapshot.chatFacts.length, 0);
    assert.doesNotMatch(JSON.stringify(snapshot), /Morgan|4111|123456/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('expires and explicitly cleans up expired local memory', async () => {
  let current = new Date('2026-08-08T12:00:00.000Z');
  const { root, repository } = await fixtureRepository({ now: () => current });
  const scope = { assistantId: 'example-assistant', conversationId: 'conversation-02', userId: 'user-01' };
  try {
    await appendChatMemory(repository, { scope, userTurn: { id: 'memory-user-02', text: 'Hello.' }, assistantTurn: { id: 'turn-02', text: 'Hello.' } });
    current = new Date('2026-08-16T12:00:00.000Z');
    assert.equal(await loadChatMemory(repository, scope), null);
    const result = await cleanupExpiredChatMemory(repository);
    assert.deepEqual(result, { scanned: 0, deleted: 0 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('serializes concurrent writes for one chat without losing turns', async () => {
  const { root, repository } = await fixtureRepository({ now: () => new Date('2026-08-08T12:00:00.000Z') });
  const scope = { assistantId: 'example-assistant', conversationId: 'conversation-03', userId: 'user-01' };
  try {
    await Promise.all([
      appendChatMemory(repository, { scope, userTurn: { id: 'memory-user-31', text: 'First.' }, assistantTurn: { id: 'turn-31', text: 'First reply.' } }),
      appendChatMemory(repository, { scope, userTurn: { id: 'memory-user-32', text: 'Second.' }, assistantTurn: { id: 'turn-32', text: 'Second reply.' } })
    ]);
    const snapshot = await loadChatMemory(repository, scope);
    assert.equal(snapshot.revision, 2);
    assert.equal(snapshot.recentTurns.length, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
