import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { acquireGatewayWorkerLease, createGatewayStore } from '../../src/gateway/gateway-store.js';

test('holds one gateway worker lease and permits explicit stale-lease recovery only', async () => {
  const deploymentRoot = await mkdtemp(path.join(os.tmpdir(), 'kgca-gateway-store-'));
  try {
    const store = createGatewayStore({ deploymentRoot, configuration: { gateway: { dataDirectory: 'app/data/gateway' } }, contracts: {} });
    const release = await acquireGatewayWorkerLease(store);
    await assert.rejects(() => acquireGatewayWorkerLease(store), { code: 'GATEWAY_WORKER_LEASE_ACTIVE' });
    await release();
    const recovered = await acquireGatewayWorkerLease(store, { recover: true });
    await recovered();
  } finally {
    await rm(deploymentRoot, { recursive: true, force: true });
  }
});
