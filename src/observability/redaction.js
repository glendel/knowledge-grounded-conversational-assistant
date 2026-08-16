import { redactSensitiveText } from '../security/content-safety.js';

const SENSITIVE_KEY = /(secret|token|api[_-]?key|authorization|password|credential)/i;

export function redactForObservation(value) {
  if (Array.isArray(value)) return value.map(redactForObservation);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactForObservation(child)
    ]));
  }
  return typeof value === 'string' ? redactSensitiveText(value).text : value;
}

export function createObservationEvent({ eventType, correlationId, occurredAt, details = {} }) {
  if (typeof eventType !== 'string' || eventType.length === 0) throw new TypeError('eventType is required.');
  if (typeof correlationId !== 'string' || correlationId.length === 0) throw new TypeError('correlationId is required.');
  return Object.freeze({ schemaVersion: 1, eventType, correlationId, occurredAt, details: redactForObservation(details) });
}
