const ERROR_CODE = /^[A-Z][A-Z0-9_]{2,79}$/;

function assertCorrelationId(correlationId) {
  if (typeof correlationId !== 'string' || correlationId.length === 0 || correlationId.length > 128) {
    throw new TypeError('correlationId is required and must be an opaque identifier.');
  }
}

export function createSuccessResult({ correlationId, data = null, occurredAt }) {
  assertCorrelationId(correlationId);
  if (typeof occurredAt !== 'string' || Number.isNaN(Date.parse(occurredAt))) {
    throw new TypeError('occurredAt must be an RFC 3339-compatible timestamp.');
  }
  return Object.freeze({ schemaVersion: 1, status: 'success', correlationId, occurredAt, data, error: null });
}

export function createFailureResult({ correlationId, code, administratorMessage, occurredAt }) {
  assertCorrelationId(correlationId);
  if (typeof code !== 'string' || !ERROR_CODE.test(code)) {
    throw new TypeError('code must be a stable uppercase error code.');
  }
  if (typeof administratorMessage !== 'string' || administratorMessage.length === 0 || administratorMessage.length > 500) {
    throw new TypeError('administratorMessage is required and must be safe for operations.');
  }
  if (typeof occurredAt !== 'string' || Number.isNaN(Date.parse(occurredAt))) {
    throw new TypeError('occurredAt must be an RFC 3339-compatible timestamp.');
  }
  return Object.freeze({
    schemaVersion: 1,
    status: 'failure',
    correlationId,
    occurredAt,
    data: null,
    error: Object.freeze({ code, administratorMessage })
  });
}
