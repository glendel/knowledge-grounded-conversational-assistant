import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadContractRegistry, REQUIRED_CONTRACT_FILES, validateContractInstance } from '../../src/contracts/contract-registry.js';
import { validContractFixtures } from '../fixtures/contracts/contract-fixtures.js';

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function loadContracts() {
  return loadContractRegistry({ contractsDirectory: path.join(coreRoot, 'context', 'contracts') });
}

test('loads every required strict versioned contract with a unique ID', async () => {
  const contracts = await loadContracts();
  assert.deepEqual(Object.keys(contracts), REQUIRED_CONTRACT_FILES);
  assert.equal(new Set(Object.values(contracts).map((contract) => contract.$id)).size, REQUIRED_CONTRACT_FILES.length);
});

test('accepts a valid synthetic fixture for every Core contract', async () => {
  const contracts = await loadContracts();
  assert.deepEqual(Object.keys(validContractFixtures), REQUIRED_CONTRACT_FILES);
  for (const [fileName, fixture] of Object.entries(validContractFixtures)) {
    const result = validateContractInstance(contracts[fileName], fixture);
    assert.equal(result.valid, true, `${fileName}: ${result.failures.join('; ')}`);
  }
});

test('rejects an unexpected property for every strict Core contract', async () => {
  const contracts = await loadContracts();
  for (const [fileName, fixture] of Object.entries(validContractFixtures)) {
    const result = validateContractInstance(contracts[fileName], { ...fixture, unexpectedInternalField: true });
    assert.equal(result.valid, false, fileName);
    assert.match(result.failures.join('\n'), /not allowed/);
  }
});

test('rejects invalid outcome and malformed timestamp values', async () => {
  const contracts = await loadContracts();
  const turn = structuredClone(validContractFixtures['conversation-turn.contract.json']);
  turn.outcome = 'invented';
  assert.equal(validateContractInstance(contracts['conversation-turn.contract.json'], turn).valid, false);
  const message = structuredClone(validContractFixtures['conversation-message.contract.json']);
  message.timestamp = 'not a timestamp';
  assert.equal(validateContractInstance(contracts['conversation-message.contract.json'], message).valid, false);
  message.timestamp = '2026-08-16';
  assert.equal(validateContractInstance(contracts['conversation-message.contract.json'], message).valid, false);
});
