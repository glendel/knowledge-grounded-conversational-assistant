import assert from 'node:assert/strict';
import test from 'node:test';

import { createOpaqueId, isOpaqueId, nowUtcIso } from '../../src/core/ids.js';
import { createObservationEvent, redactForObservation } from '../../src/observability/redaction.js';

test('creates opaque identifiers without business meaning', () => {
  const id = createOpaqueId('turn');
  assert.match(id, /^turn_[0-9a-f-]{36}$/);
  assert.equal(isOpaqueId(id), true);
  assert.throws(() => createOpaqueId('ExampleProduct'), /lowercase kebab-case/);
});

test('produces UTC ISO timestamps', () => {
  class FixedClock {
    toISOString() {
      return '2026-08-16T15:00:00.000Z';
    }
  }
  assert.equal(nowUtcIso(FixedClock), '2026-08-16T15:00:00.000Z');
});

test('redacts secrets recursively from observations', () => {
  const redacted = redactForObservation({ apiKey: 'secret', nested: { authorization: 'Bearer value', safe: 'value' }, entries: [{ token: 'hidden' }] });
  assert.deepEqual(redacted, { apiKey: '[REDACTED]', nested: { authorization: '[REDACTED]', safe: 'value' }, entries: [{ token: '[REDACTED]' }] });
});

test('creates structured redacted observation events', () => {
  const event = createObservationEvent({ eventType: 'core.checked', correlationId: 'event_01', occurredAt: '2026-08-16T15:00:00Z', details: { password: 'hidden', status: 'ok' } });
  assert.equal(event.schemaVersion, 1);
  assert.equal(event.details.password, '[REDACTED]');
  assert.equal(event.details.status, 'ok');
});

test('redacts sensitive candidates even when the observation field name is harmless', () => {
  assert.equal(redactForObservation({ note: 'Contact person@example.test.' }).note, 'Contact [REDACTED_EMAIL].');
});
