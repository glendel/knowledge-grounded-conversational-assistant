import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FoundationError } from '../../src/core/foundation-error.js';
import { createDeploymentDescriptor } from '../../src/deployment/deployment-descriptor.js';
import { writeSyntheticCoreConfiguration } from '../fixtures/core-configuration.js';

const CORE_ROOT = path.resolve(import.meta.dirname, '..', '..');

async function createSyntheticDeployment() {
  const deploymentRoot = await mkdtemp(path.join(os.tmpdir(), 'kgca-deployment-'));
  await writeSyntheticCoreConfiguration(path.join(deploymentRoot, 'config'));
  await mkdir(path.join(deploymentRoot, 'app'), { recursive: true });
  return deploymentRoot;
}

test('creates one immutable descriptor for an explicit separate deployment', async () => {
  const deploymentRoot = await createSyntheticDeployment();
  try {
    const descriptor = await createDeploymentDescriptor({ coreRoot: CORE_ROOT, deploymentRoot });
    assert.equal(descriptor.coreRoot, CORE_ROOT);
    assert.equal(descriptor.deploymentRoot, deploymentRoot);
    assert.equal(descriptor.paths.configDirectory, path.join(deploymentRoot, 'config'));
    assert.equal(descriptor.paths.appDirectory, path.join(deploymentRoot, 'app'));
    assert.equal(descriptor.paths.knowledge.approvedDirectory, path.join(deploymentRoot, 'app', 'knowledge', 'approved'));
    assert.equal(Object.isFrozen(descriptor), true);
    assert.equal(Object.isFrozen(descriptor.configuration), true);
    assert.equal(Object.isFrozen(descriptor.paths), true);
  } finally {
    await rm(deploymentRoot, { recursive: true, force: true });
  }
});

test('does not infer a deployment root and rejects nested Core/deployment roots', async () => {
  await assert.rejects(
    () => createDeploymentDescriptor({ coreRoot: CORE_ROOT }),
    (error) => error instanceof FoundationError && error.code === 'DEPLOYMENT_ROOT_INVALID'
  );
  const nestedDeployment = path.join(CORE_ROOT, 'app-template');
  await assert.rejects(() => createDeploymentDescriptor({ coreRoot: CORE_ROOT, deploymentRoot: nestedDeployment }), (error) => error instanceof FoundationError && error.code === 'DEPLOYMENT_ROOT_OVERLAP');
});

test('supports an explicit self-hosted deployment rooted at the cloned Core', async () => {
  const selfHostedRoot = await mkdtemp(path.join(os.tmpdir(), 'kgca-self-hosted-'));
  try {
    await cp(path.join(CORE_ROOT, 'context', 'contracts'), path.join(selfHostedRoot, 'context', 'contracts'), { recursive: true });
    await writeSyntheticCoreConfiguration(path.join(selfHostedRoot, 'config'));
    await mkdir(path.join(selfHostedRoot, 'app'), { recursive: true });
    const descriptor = await createDeploymentDescriptor({ coreRoot: selfHostedRoot, deploymentRoot: selfHostedRoot });
    assert.equal(descriptor.mode, 'self_hosted');
    assert.equal(descriptor.coreRoot, descriptor.deploymentRoot);
  } finally {
    await rm(selfHostedRoot, { recursive: true, force: true });
  }
});

test('requires a complete deployment-owned config and app root', async () => {
  const deploymentRoot = await mkdtemp(path.join(os.tmpdir(), 'kgca-deployment-'));
  try {
    await assert.rejects(
      () => createDeploymentDescriptor({ coreRoot: CORE_ROOT, deploymentRoot }),
      (error) => error instanceof FoundationError && error.code === 'DEPLOYMENT_CONFIG_DIRECTORY_MISSING'
    );
    await writeSyntheticCoreConfiguration(path.join(deploymentRoot, 'config'));
    await assert.rejects(
      () => createDeploymentDescriptor({ coreRoot: CORE_ROOT, deploymentRoot }),
      (error) => error instanceof FoundationError && error.code === 'DEPLOYMENT_APP_DIRECTORY_MISSING'
    );
  } finally {
    await rm(deploymentRoot, { recursive: true, force: true });
  }
});

test('rejects a deployment configuration that weakens approved-only knowledge policy', async () => {
  const deploymentRoot = await createSyntheticDeployment();
  try {
    const policyPath = path.join(deploymentRoot, 'config', 'knowledge-policy.json');
    const policy = JSON.parse(await readFile(policyPath, 'utf8'));
    policy.rawSourceRuntimeAccess = true;
    await writeFile(policyPath, JSON.stringify(policy), 'utf8');
    await assert.rejects(
      () => createDeploymentDescriptor({ coreRoot: CORE_ROOT, deploymentRoot }),
      (error) => error instanceof FoundationError && /approved-only retrieval/.test(error.message)
    );
  } finally {
    await rm(deploymentRoot, { recursive: true, force: true });
  }
});

test('keeps independently selected deployment configurations isolated', async () => {
  const first = await createSyntheticDeployment();
  const second = await createSyntheticDeployment();
  try {
    const firstDescriptor = await createDeploymentDescriptor({ coreRoot: CORE_ROOT, deploymentRoot: first });
    const secondDescriptor = await createDeploymentDescriptor({ coreRoot: CORE_ROOT, deploymentRoot: second });
    assert.notEqual(firstDescriptor.deploymentRoot, secondDescriptor.deploymentRoot);
    assert.notEqual(firstDescriptor.paths.durableDataDirectory, secondDescriptor.paths.durableDataDirectory);
    assert.notEqual(firstDescriptor.paths.knowledge.approvedDirectory, secondDescriptor.paths.knowledge.approvedDirectory);
  } finally {
    await Promise.all([rm(first, { recursive: true, force: true }), rm(second, { recursive: true, force: true })]);
  }
});
