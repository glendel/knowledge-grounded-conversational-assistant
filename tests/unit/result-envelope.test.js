import assert from 'node:assert/strict';
import test from 'node:test';

import { createFailureResult, createSuccessResult } from '../../src/core/result-envelope.js';

test('creates stable successful result envelopes', () => {
  const result = createSuccessResult({ correlationId: 'event_01', occurredAt: '2026-08-16T15:00:00Z', data: { checked: true } });
  assert.deepEqual(result, { schemaVersion: 1, status: 'success', correlationId: 'event_01', occurredAt: '2026-08-16T15:00:00Z', data: { checked: true }, error: null });
});

test('creates safe operational failure envelopes and rejects unstable codes', () => {
  const result = createFailureResult({ correlationId: 'event_01', code: 'CONFIG_INVALID_JSON', administratorMessage: 'Configuration must be strict JSON.', occurredAt: '2026-08-16T15:00:00Z' });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.data, null);
  assert.equal(result.error.code, 'CONFIG_INVALID_JSON');
  assert.throws(() => createFailureResult({ correlationId: 'event_01', code: 'not-safe', administratorMessage: 'No.', occurredAt: '2026-08-16T15:00:00Z' }), /uppercase error code/);
});
