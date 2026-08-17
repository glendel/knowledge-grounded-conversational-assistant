import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createDeploymentDescriptor } from '../../src/deployment/deployment-descriptor.js';
import { loadDeploymentQualificationRecords } from '../../src/deployment/provider-qualification-records.js';
import { validContractFixtures } from '../fixtures/contracts/contract-fixtures.js';
import { writeSyntheticCoreConfiguration } from '../fixtures/core-configuration.js';

const CORE_ROOT = path.resolve(import.meta.dirname, '..', '..');

async function createDeployment() {
  const deploymentRoot = await mkdtemp(path.join(os.tmpdir(), 'kgca-qualification-'));
  await writeSyntheticCoreConfiguration(path.join(deploymentRoot, 'config'));
  await mkdir(path.join(deploymentRoot, 'app'), { recursive: true });
  return deploymentRoot;
}

test('loads only validated qualification records from the explicitly selected deployment', async () => {
  const deploymentRoot = await createDeployment();
  try {
    const directory = path.join(deploymentRoot, 'app', 'evaluations', 'provider-qualification');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'qualification.json'), JSON.stringify(validContractFixtures['model-qualification-record.contract.json']), 'utf8');
    await writeFile(path.join(directory, 'ignore.txt'), 'not a record', 'utf8');
    const descriptor = await createDeploymentDescriptor({ coreRoot: CORE_ROOT, deploymentRoot });
    const records = await loadDeploymentQualificationRecords({ descriptor });
    assert.equal(records.length, 1);
    assert.equal(records[0].id, 'qualification-01');
  } finally {
    await rm(deploymentRoot, { recursive: true, force: true });
  }
});

test('does not require qualification files when a deployment has no network lane records', async () => {
  const deploymentRoot = await createDeployment();
  try {
    const descriptor = await createDeploymentDescriptor({ coreRoot: CORE_ROOT, deploymentRoot });
    assert.deepEqual(await loadDeploymentQualificationRecords({ descriptor }), []);
  } finally {
    await rm(deploymentRoot, { recursive: true, force: true });
  }
});
