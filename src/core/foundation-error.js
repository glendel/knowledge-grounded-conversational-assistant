export class FoundationError extends Error {
  constructor(message, { code = 'FOUNDATION_VALIDATION_ERROR', path = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'FoundationError';
    this.code = code;
    this.path = path;
  }
}
