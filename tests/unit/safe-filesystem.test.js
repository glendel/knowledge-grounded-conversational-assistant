import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FoundationError } from '../../src/core/foundation-error.js';
import { readStrictJsonFile, resolveInside, writeJsonAtomic, writeTextAtomic } from '../../src/core/safe-filesystem.js';

test('refuses paths that escape governed storage', () => {
  assert.throws(() => resolveInside('C:\\temporary-root', '..\\outside.json'), (error) => error instanceof FoundationError && error.code === 'FILESYSTEM_PATH_ESCAPE');
});

test('writes LF text and strict JSON atomically inside the allowed root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kgca-core-filesystem-'));
  try {
    const jsonPath = await writeJsonAtomic(root, 'records/example.json', { schemaVersion: 1, status: 'ok' });
    assert.deepEqual(await readStrictJsonFile(jsonPath), { schemaVersion: 1, status: 'ok' });
    const textPath = await writeTextAtomic(root, 'records/note.txt', 'one\r\ntwo\n');
    assert.equal(await (await import('node:fs/promises')).readFile(textPath, 'utf8'), 'one\ntwo\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
