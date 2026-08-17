import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadContractRegistry } from '../../src/contracts/contract-registry.js';
import { isLaneQualified, loadProviderProseQualificationDataset } from '../../src/ai/model-qualification.js';
import { validContractFixtures } from '../fixtures/contracts/contract-fixtures.js';

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('a network lane requires matching approved, complete qualification evidence', () => {
  const lane = { id: 'network-lane', qualificationRecordId: 'qualification-01', model: 'configured-later' };
  const provider = { id: 'network-provider', kind: 'openrouter' };
  const approved = { id: 'qualification-01', laneId: 'network-lane', providerId: 'network-provider', model: 'configured-later', status: 'approved', results: { spanish: true, english: true, prosePreserved: true, failureSafety: true } };
  assert.equal(isLaneQualified({ lane, provider, records: [approved] }), true);
  assert.equal(isLaneQualified({ lane, provider, records: [{ ...approved, status: 'draft' }] }), false);
  assert.equal(isLaneQualified({ lane, provider, records: [{ ...approved, results: { ...approved.results, english: false } }] }), false);
  assert.equal(isLaneQualified({ lane, provider: { id: 'deterministic-provider', kind: 'deterministic' }, records: [] }), true);
});

test('a synthetic qualification dataset must cover Spanish and English prose checks', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'kgca-qualification-'));
  try {
    const contracts = await loadContractRegistry({ contractsDirectory: path.join(coreRoot, 'context', 'contracts') });
    const dataset = structuredClone(validContractFixtures['provider-prose-qualification-dataset.contract.json']);
    const filePath = path.join(directory, 'dataset.json');
    await writeFile(filePath, `${JSON.stringify(dataset)}\n`, 'utf8');
    const loaded = await loadProviderProseQualificationDataset({ filePath, contract: contracts['provider-prose-qualification-dataset.contract.json'] });
    assert.deepEqual(new Set(loaded.cases.map((item) => item.language)), new Set(['es', 'en']));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
