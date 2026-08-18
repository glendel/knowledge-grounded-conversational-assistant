import assert from 'node:assert/strict';
import test from 'node:test';

import { createGatewayRuntime } from '../../src/gateway/gateway-runtime.js';

test('passes deployment qualification records into its normal conversation runtime', async () => {
  const descriptor = {
    deploymentRoot: 'C:/synthetic-deployment',
    configuration: { gateway: { dataDirectory: 'app/data/gateway' } },
    contracts: {}
  };
  const qualificationRecords = [{ id: 'qualified-lane-record' }];
  let received = null;
  const runtime = await createGatewayRuntime({
    descriptor,
    qualificationRecords,
    conversationFactory: (input) => {
      received = input.qualificationRecords;
      return { descriptor };
    }
  });
  assert.equal(received, qualificationRecords);
  assert.equal(runtime.qualificationRecords, qualificationRecords);
});
