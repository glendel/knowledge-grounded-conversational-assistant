import { randomUUID } from 'node:crypto';

export function createOpaqueId(prefix) {
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(prefix)) {
    throw new TypeError('ID prefix must be a lowercase kebab-case identifier.');
  }

  return `${prefix}_${randomUUID()}`;
}

export function isOpaqueId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

export function nowUtcIso(clock = Date) {
  return new clock().toISOString();
}
